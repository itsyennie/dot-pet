const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { log } = require('./recovery/log.cjs');

function installRecovery(app) {
  const dir = path.join(app.getPath('userData'), 'diagnostics');
  const cleanFile = path.join(dir, randomUUID() + '.clean');
  const record = (event, details) => log(dir, event, details);
  let stopped = false;
  const stop = (reason = 'normal-exit') => {
    if (stopped) return;
    stopped = true;
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(cleanFile, 'clean'); } catch {}
    record('normal-exit', { reason });
  };
  record('app-start', { version: app.getVersion(), pid: process.pid });
  const helper = path.join(app.isPackaged ? path.join(process.resourcesPath, 'recovery') : path.join(__dirname, 'recovery'), 'watchdog.cjs');
  const config = { dir, cleanFile, parentPid: process.pid,
    executable: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()] };
  const child = spawn(process.execPath, [helper, JSON.stringify(config)], {
    detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  child.on('error', error => record('watchdog-error', { code: error.code }));
  child.unref();
  child.channel?.unref();
  // Only technical frame locations are stored; never error messages, URLs or chat text.
  function errorDetails(error) {
    return { name: ['Error','TypeError','RangeError','ReferenceError','SyntaxError'].includes(error?.name) ? error.name : 'Error',
      frames: String(error?.stack || '').split('\n').slice(1).map(line => line.match(/([\w.-]+\.(?:js|cjs)):(\d+):(\d+)/)?.[0]).filter(Boolean).slice(0, 8) };
  }
  process.on('uncaughtException', error => { record('uncaught-exception', errorDetails(error)); app.exit(1); });
  process.on('unhandledRejection', error => record('unhandled-rejection', errorDetails(error)));
  app.on('before-quit', () => stop());
  app.on('browser-window-created', (_, window) => {
    window.on('query-session-end', () => stop('windows-session-end'));
    window.on('session-end', () => stop('windows-session-end'));
  });
  app.on('child-process-gone', (_, details) => record('child-process-gone', { type: details.type, reason: details.reason, exitCode: details.exitCode }));
  app.on('web-contents-created', (_, contents) => {
    let failures = [];
    contents.on('render-process-gone', (_, details) => {
      record('render-process-gone', { id: contents.id, reason: details.reason, exitCode: details.exitCode });
      if (stopped || details.reason === 'clean-exit') return;
      failures = failures.filter(t => Date.now() - t < 300000);
      if (failures.length >= 3) { record('renderer-recovery-paused', { id: contents.id }); return; }
      failures.push(Date.now());
      setTimeout(() => { if (!stopped && !contents.isDestroyed()) { record('renderer-reload', { id: contents.id }); contents.reload(); } }, 1500);
    });
    contents.on('unresponsive', () => record('renderer-unresponsive', { id: contents.id }));
  });
  return { dir, record, stop };
}
module.exports = { installRecovery };
