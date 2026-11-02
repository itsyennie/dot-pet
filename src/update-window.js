let window, toast;
function showUpdate(result, manual, api = require('electron')) {
  const { BrowserWindow, Notification, shell } = api;
  const release = result.release;
  // Only our numeric version and fixed GitHub release URL may reach this window.
  if (release && (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^https:\/\/github\.com\/itsyennie\/dot-pet\/releases\/tag\/v?\d+\.\d+\.\d+$/.test(release.url))) throw Error('Invalid update');
  const current = /^\d+\.\d+\.\d+$/.test(result.current) ? result.current : '';
  if (window && !window.isDestroyed()) { window.close(); }
  toast?.close();
  const title = release ? 'dot-pet 새 버전이 나왔어요' : 'dot-pet 업데이트 확인';
  const message = release ? `현재 ${current} → 새 버전 ${release.version}${release.preview ? ' (미리보기)' : ''}<br>다운로드 페이지에서 새 설치 파일을 받아 주세요.`
    : result.status === 'current' ? `현재 ${current} 버전이 최신이에요.`
    : result.status === 'wait' ? '방금 확인했어요. 잠시 후 다시 확인해 주세요.' : '새 버전을 확인하지 못했어요.<br>인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  window = new BrowserWindow({ width: 480, height: 270, show: false, resizable: false, title, autoHideMenuBar: true,
    backgroundColor: '#fff7f0', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const currentWindow = window;
  currentWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  currentWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url === 'https://dot-pet.invalid/download' && release) shell.openExternal(release.url).catch(() => {});
    if (['https://dot-pet.invalid/download','https://dot-pet.invalid/close'].includes(url)) currentWindow.close();
  });
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:28px;font:14px 'Segoe UI',sans-serif;color:#46372f;background:#fff7f0}h2{font-size:20px;margin:0 0 16px}p{line-height:1.7}nav{display:flex;gap:10px;margin-top:22px}a{padding:10px 16px;border-radius:10px;background:#eb866c;color:white;text-decoration:none;font-weight:600}a:last-child{background:#eadfd7;color:#46372f}</style><h2>${title}</h2><p>${message}</p><nav>${release ? '<a href="https://dot-pet.invalid/download">다운로드 페이지 열기</a>' : ''}<a href="https://dot-pet.invalid/close">${release ? '나중에' : '닫기'}</a></nav>`;
  return currentWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).then(() => {
    if (currentWindow.isDestroyed()) return;
    if (manual) { currentWindow.show(); currentWindow.focus(); } else currentWindow.showInactive();
    if (release && !manual && Notification.isSupported()) {
      try { toast = new Notification({ title, body: `${release.version} 버전을 다운로드할 수 있어요.` });
        toast.on('click', () => { if (!currentWindow.isDestroyed()) { currentWindow.show(); currentWindow.focus(); } });
        toast.on('failed', () => {}); toast.show();
      } catch {}
    }
  });
}
module.exports = { showUpdate };
