const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dot-pet-render-recovery-')));
let alerts = 0;
const recovery = require('../src/recovery').installRecovery(app, { onPaused: ({kind}) => { assert.equal(kind, 'renderer'); alerts++; } });
const timeout = setTimeout(() => { console.error('Renderer recovery timeout'); app.quit(); process.exitCode = 1; }, 15000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL('data:text/html,<p>offline recovery test</p>');
  const restored = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.forcefullyCrashRenderer();
  await restored;
  assert.equal(await window.webContents.executeJavaScript('document.body.innerText'), 'offline recovery test');
  const log = fs.readFileSync(path.join(recovery.dir, 'recovery.jsonl'), 'utf8');
  assert.ok(log.includes('render-process-gone'));
  assert.ok(log.includes('renderer-reload'));
  for (let i = 0; i < 2; i++) {
    const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    window.webContents.forcefullyCrashRenderer(); await loaded;
  }
  window.webContents.forcefullyCrashRenderer();
  await new Promise(resolve => setTimeout(resolve, 2000));
  assert.equal(alerts, 1);
  assert.ok(fs.readFileSync(path.join(recovery.dir, 'recovery.jsonl'), 'utf8').includes('renderer-recovery-paused'));
  console.log('PASS actual renderer recovery and alert at recovery limit');
  clearTimeout(timeout);
  app.quit();
}).catch(error => { console.error(error); clearTimeout(timeout); app.quit(); process.exitCode = 1; });
