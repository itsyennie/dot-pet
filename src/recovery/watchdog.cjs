// Separate, idle Node process: survives the Electron main process exiting.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { log } = require('./log.cjs');
const config = JSON.parse(process.argv[2]);
const { dir, cleanFile, executable, args, parentPid } = config;
log(dir, 'watchdog-start', { parentPid, pid: process.pid });
process.on('message', () => {});
process.on('disconnect', () => {
  // Allow the old process and its Chromium children to finish shutting down.
  setTimeout(recover, 3000);
});
function recover() {
  if (fs.existsSync(cleanFile)) {
    try { fs.unlinkSync(cleanFile); } catch {}
    log(dir, 'watchdog-stop', { parentPid, reason: 'normal-exit' });
    return;
  }
  try { process.kill(parentPid, 0); setTimeout(recover, 1000); return; } catch {}
  const stateFile = path.join(dir, 'restart-history.json');
  let history = [];
  try { history = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  history = Array.isArray(history) ? history.filter(t => Number.isFinite(t) && Date.now() - t < 600000) : [];
  log(dir, 'unexpected-exit', { parentPid });
  if (history.length >= 5) {
    log(dir, 'recovery-paused', { reason: 'five-restarts-in-ten-minutes' });
    try { fs.writeFileSync(path.join(dir, 'recovery-alert-pending'), 'app'); } catch {}
    launch([...args, '--recovery-alert'], 'recovery-alert-launched');
    return;
  }
  history.push(Date.now());
  try { fs.writeFileSync(stateFile, JSON.stringify(history)); } catch {}
  launch(args, 'restarted');
}
function launch(launchArgs, event) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(executable, launchArgs, { detached: true, stdio: 'ignore', windowsHide: true, env });
    child.on('error', error => log(dir, 'restart-failed', { code: error.code }));
    child.on('spawn', () => log(dir, event, { pid: child.pid }));
    child.unref();
  } catch (error) { log(dir, 'restart-failed', { code: error.code }); }
}
