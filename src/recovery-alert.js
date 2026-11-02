const fs = require('node:fs');
const path = require('node:path');
const { log } = require('./recovery/log.cjs');
let active;
function showDialog({ title, message }, { BrowserWindow }) {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({ width: 490, height: 285, resizable: false, show: false,
      title, alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#fff7f0',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    let response = 1;
    window.on('closed', () => resolve({ response }));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (url === 'https://dot-pet.invalid/logs') { response = 0; window.close(); }
      if (url === 'https://dot-pet.invalid/close') window.close();
    });
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:28px;font:14px 'Segoe UI',sans-serif;color:#46372f;background:#fff7f0}h2{font-size:20px;margin:0 0 16px}p{line-height:1.6}nav{display:flex;gap:10px;margin-top:22px}a{padding:10px 16px;border-radius:10px;background:#eb866c;color:white;text-decoration:none;font-weight:600}a:last-child{background:#eadfd7;color:#46372f}</style><h2>${title}</h2><p>${message}<br>오류 기록을 확인한 뒤 앱을 직접 다시 실행해 주세요.</p><nav><a href="https://dot-pet.invalid/logs">오류 기록 열기</a><a href="https://dot-pet.invalid/close">닫기</a></nav>`;
    window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).then(() => { window.show(); window.focus(); }).catch(error => { window.destroy(); reject(error); });
  });
}
function showRecoveryPaused({ dir, kind }, api = require('electron'), displayDialog = showDialog) {
  if (active) return active;
  active = (async () => {
    const { Notification, shell } = api;
    const title = 'dot-pet 자동 복구가 멈췄어요';
    const message = kind === 'renderer'
      ? '화면 오류가 반복되어 자동 복구를 중단했습니다.'
      : '앱이 반복해서 종료되어 자동 재실행을 중단했습니다.';
    const openLogs = async () => {
      try { if (await shell.openPath(dir)) log(dir, 'diagnostics-open-failed'); }
      catch { log(dir, 'diagnostics-open-failed'); }
    };
    let notification;
    try {
      if (Notification.isSupported()) {
        notification = new Notification({ title, body: message + ' 오류 기록을 확인해 주세요.', timeoutType: 'never' });
        notification.on('click', openLogs);
        notification.on('show', () => log(dir, 'recovery-notification-shown', { kind }));
        notification.on('failed', () => log(dir, 'recovery-notification-failed', { kind }));
        notification.show();
      }
    } catch { log(dir, 'recovery-notification-failed', { kind }); }
    try {
      log(dir, 'recovery-alert-opened', { kind });
      const result = await displayDialog({ title, message }, api);
      if (result.response === 0) await openLogs();
      log(dir, 'recovery-alert-acknowledged', { kind });
      if (kind === 'app') fs.rmSync(path.join(dir, 'recovery-alert-pending'), { force: true });
    } catch { log(dir, 'recovery-alert-failed', { kind }); }
    finally { try { notification?.close(); } catch {} }
  })().finally(() => { active = null; });
  return active;
}
module.exports = { showRecoveryPaused };
