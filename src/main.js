const { app, BrowserWindow, WebContentsView, Tray, Menu, nativeImage, screen, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { snapshot, waitForComposer, sendMessage, receiveReply, hasPending, clearPending } = require('./dot-bridge');

const { connectPage } = require('./connection');
let connectionAttempt = null;
let pet, panel, settingsWindow, chatWindow, chatView, tray, quitting = false;
let bridgeStatus = 'login-needed', bridgeBusy = false, moveSaveTimer;
let settings = { x: null, y: null, scale: 1, visible: true, startup: false, dotName: '모리', dotUrl: 'https://chatgpt.com/dots/home', avatar: '' };
const sizes = { pet: 112, panelW: 370, panelH: 240 };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
function saveSettings() { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); notify(); }
function notify() { for (const w of [pet, panel, settingsWindow]) if (w && !w.isDestroyed()) w.webContents.send('state:changed', publicState()); updateTray(); }
function publicState() { return { ...settings, avatar: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(settings.avatar) ? settings.avatar : '', bridgeStatus, bridgeBusy }; }
function setPetBounds(x, y) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const b = display.workArea;
  const s = Math.round(sizes.pet * settings.scale);
  x = clamp(Math.round(x), b.x, b.x + b.width - s);
  y = clamp(Math.round(y), b.y, b.y + b.height - s);
  const edge = 28;
  if (Math.abs(x - b.x) < edge) x = b.x;
  if (Math.abs(x - (b.x + b.width - s)) < edge) x = b.x + b.width - s;
  if (Math.abs(y - b.y) < edge) y = b.y;
  if (Math.abs(y - (b.y + b.height - s)) < edge) y = b.y + b.height - s;
  settings.x = x; settings.y = y;
  pet.setBounds({ x, y, width: s, height: s });
  if (panel?.isVisible()) placePanel();
  clearTimeout(moveSaveTimer);
  moveSaveTimer = setTimeout(saveSettings, 250);
}
function placePanel() {
  const p = pet.getBounds(), d = screen.getDisplayMatching(p).workArea;
  const x = p.x + p.width + sizes.panelW + 12 <= d.x + d.width ? p.x + p.width + 12 : p.x - sizes.panelW - 12;
  panel.setBounds({ x: clamp(x, d.x, d.x + d.width - sizes.panelW), y: clamp(p.y, d.y, d.y + d.height - sizes.panelH), width: sizes.panelW, height: sizes.panelH });
}
function togglePanel() { if (panel.isVisible()) panel.hide(); else { settings.visible = true; pet.show(); placePanel(); panel.show(); panel.focus(); saveSettings(); } }
function setVisible(value) { settings.visible = value; value ? pet.show() : (pet.hide(), panel.hide()); saveSettings(); }
function showSettings() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = new BrowserWindow({ width: 352, height: 550, show: false, frame: false, resizable: false, alwaysOnTop: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    settingsWindow.loadFile(path.join(__dirname, 'index.html'), { query: { view: 'settings' } });
    settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    settingsWindow.webContents.on('will-navigate', event => event.preventDefault());
    settingsWindow.on('closed', () => { settingsWindow = null; });
  }
  const d = screen.getDisplayMatching(pet.getBounds()).workArea;
  settingsWindow.setPosition(clamp(pet.getBounds().x - 352, d.x, d.x + d.width - 352), clamp(pet.getBounds().y, d.y, d.y + d.height - 550));
  settingsWindow.show(); settingsWindow.focus();
}
function ensureChatWindow() {
  if (!chatWindow || chatWindow.isDestroyed()) {
    chatWindow = new BrowserWindow({
      show: false, width: 580, height: 760, minWidth: 420, minHeight: 560,
      title: `${settings.dotName}와 대화`, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    chatWindow.loadFile(path.join(__dirname, 'chat-shell.html'));
    chatView = new WebContentsView({ webPreferences: { partition: 'persist:mori-dot-web', backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    chatWindow.contentView.addChildView(chatView);
    const resizeChat = () => { const [width, height] = chatWindow.getContentSize(); chatView.setBounds({ x: 0, y: 56, width, height: Math.max(0, height - 56) }); };
    chatWindow.on('resize', resizeChat);
    resizeChat();
    chatView.webContents.setWindowOpenHandler(({ url: target }) => {
      if (!target.startsWith('https://')) return { action: 'deny' };
      const host = new URL(target).hostname;
      if (['chatgpt.com', 'auth.openai.com', 'accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com'].includes(host)) {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: 'persist:mori-dot-web', contextIsolation: true, nodeIntegration: false, sandbox: true } } };
      }
      shell.openExternal(target);
      return { action: 'deny' };
    });
    chatView.webContents.on('will-navigate', (event, target) => {
      if (target.startsWith('https://')) return;
      event.preventDefault();
    });
    chatView.webContents.on('did-fail-load', (_, code, description, failedUrl, isMainFrame) => {
      if (isMainFrame && code !== -3) chatWindow.setTitle(`모리 대화 · 연결 오류: ${description}`);
    });

    chatWindow.on('close', event => { if (!quitting) { event.preventDefault(); chatWindow.hide(); } });
    chatWindow.on('closed', () => { chatWindow = null; chatView = null; bridgeStatus = 'login-needed'; if (!quitting) notify(); });
  }
}
function showChat() {
  ensureChatWindow();
  if (!chatView.webContents.getURL()) chatView.webContents.loadURL(settings.dotUrl).catch(() => {});
  chatWindow.show();
  chatWindow.focus();
}
function navigateChat(destination) {
  showChat();
  return chatView.webContents.loadURL(destination === 'dot' && validDotUrl(settings.dotUrl) ? settings.dotUrl : 'https://chatgpt.com/');
}
function connectDot() {
  if (connectionAttempt) return connectionAttempt;
  connectionAttempt = performConnect().finally(() => { connectionAttempt = null; });
  return connectionAttempt;
}
async function performConnect() {
  if (bridgeBusy) return { ok: false, message: '답변 확인이 끝난 뒤 연결해 주세요.' };
  ensureChatWindow();
  bridgeStatus = 'connecting'; notify();
  try {
    const current = await connectPage(chatView.webContents, validDotUrl(settings.dotUrl) ? settings.dotUrl : 'https://chatgpt.com/dots/home');
    bridgeStatus = 'ready'; notify();
    return { ok: true, messages: current.messages };
  } catch (error) {
    bridgeStatus = 'login-needed'; notify();
    showChat();
    const message = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_TIMED_OUT/.test(error.message)
      ? 'ChatGPT 페이지에 접속하지 못했어요. 네트워크 연결과 열린 대화 창을 확인해 주세요.'
      : error.message;
    return { ok: false, message };
  }
}
async function sendDot(text) {
  if (bridgeBusy) throw new Error('이전 답변을 기다리고 있어요.');
  if (!String(text || '').trim()) throw new Error('메시지를 입력해 주세요.');
  bridgeBusy = true; notify();
  try {
    ensureChatWindow();
    try {
      await connectPage(chatView.webContents, settings.dotUrl);
      bridgeStatus = 'ready'; notify();
    } catch (error) {
      bridgeStatus = 'login-needed'; notify(); showChat();
      throw error;
    }
    return await sendMessage(chatView.webContents, text, chunk => {
      if (panel && !panel.isDestroyed()) panel.webContents.send('bridge:chunk', chunk);
    });
  } catch (error) {

    throw error;
  } finally { bridgeBusy = false; notify(); }
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: settings.visible ? '모리 숨기기' : '모리 표시', click: () => setVisible(!settings.visible) },
    { label: '말풍선 대화 열기', click: togglePanel },
    { label: '꾸미기 · 설정', click: showSettings },
    { label: 'ChatGPT 로그인 화면', click: showChat },
    { label: '기본 브라우저에서 열기', click: openDot },
    { type: 'separator' },
    { label: 'Windows 시작 시 실행', type: 'checkbox', checked: settings.startup, click: item => setStartup(item.checked) },
    { label: '종료', click: () => { quitting = true; app.quit(); } }
  ]));
}
function setStartup(value) {
  const args = app.isPackaged ? [] : [app.getAppPath()];
  app.setLoginItemSettings({ openAtLogin: !!value, path: process.execPath, args });
  settings.startup = !!value;
  saveSettings();
  return publicState();
}
function createWindows() {
  const common = { show: false, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } };
  pet = new BrowserWindow({ ...common, width: 112, height: 112, transparent: true, hasShadow: false, backgroundColor: '#00000000' });
  pet.loadFile(path.join(__dirname, 'index.html'), { query: { view: 'pet' } });
  panel = new BrowserWindow({ ...common, width: sizes.panelW, height: sizes.panelH, transparent: true, backgroundColor: '#00000000', hasShadow: false });
  panel.loadFile(path.join(__dirname, 'index.html'), { query: { view: 'bubble' } });
  for (const w of [pet, panel]) {
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', e => e.preventDefault());
  }
  panel.on('blur', () => panel.hide());
  panel.on('show', () => { if (bridgeStatus !== 'ready' && !bridgeBusy) connectDot().catch(() => {}); });
  pet.on('closed', () => { if (!quitting) app.quit(); });
  const d = screen.getPrimaryDisplay().workArea;
  setPetBounds(settings.x ?? d.x + d.width - 148, settings.y ?? d.y + d.height - 148);
  if (settings.visible) pet.showInactive();
}
app.whenReady().then(() => {
  app.setAppUserModelId('com.mori.companion');
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
  settings.startup = app.getLoginItemSettings({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }).openAtLogin;
  for (const oldFile of ['api-key.bin', 'chatgpt-auth.bin', 'chatgpt-host.json']) {
    const oldPath = path.join(app.getPath('userData'), oldFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  createWindows();
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('모리');
  tray.on('double-click', () => setVisible(true));
  updateTray();
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
app.on('activate', () => { if (pet) setVisible(true); });
ipcMain.handle('state:get', () => publicState());
ipcMain.handle('scale:set', (_, value) => { settings.scale = clamp(Number(value) || 1, 0.7, 1.7); setPetBounds(settings.x, settings.y); return publicState(); });
ipcMain.handle('startup:set', (_, value) => setStartup(value));
function validDotUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'chatgpt.com' || url.hostname === 'www.chatgpt.com') && !url.username && !url.password; } catch { return false; }
}
function openDot() { return shell.openExternal(validDotUrl(settings.dotUrl) ? settings.dotUrl : 'https://chatgpt.com/'); }
ipcMain.handle('dot:open', openDot);
ipcMain.handle('dot:show-chat', showChat);
ipcMain.handle('dot:navigate', (_, destination) => navigateChat(destination));
ipcMain.handle('dot:connect', connectDot);
async function bridgeResult(action) {
  try { return { ok: true, text: await action() }; }
  catch (error) { return { ok: false, message: error.message, retryable: hasPending(chatView?.webContents) }; }
}
ipcMain.handle('dot:send', (_, text) => bridgeResult(() => sendDot(text)));
ipcMain.handle('dot:receive', () => bridgeResult(async () => {
  if (bridgeBusy || !chatView) throw new Error('잠시 후 다시 확인해 주세요.');
  bridgeBusy = true; notify();
  try { return await receiveReply(chatView.webContents, chunk => {
    if (panel && !panel.isDestroyed()) panel.webContents.send('bridge:chunk', chunk);
  }); } finally { bridgeBusy = false; notify(); }
}));
ipcMain.handle('dot:history', async () => chatView && bridgeStatus === 'ready' ? (await snapshot(chatView.webContents)).messages : []);
ipcMain.handle('settings:show', showSettings);
ipcMain.handle('settings:hide', () => settingsWindow?.hide());
ipcMain.handle('dot:save', (_, next) => {
  const name = String(next?.name || '').trim().slice(0, 40);
  const url = String(next?.url || '').trim();
  if (!name) throw new Error('이름을 입력해 주세요.');
  if (!validDotUrl(url)) throw new Error('chatgpt.com의 대화 주소를 입력해 주세요.');
  if (settings.dotUrl !== url) bridgeStatus = 'login-needed';
  settings.dotName = name; settings.dotUrl = url;
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.setTitle(`${name}와 대화`);
  saveSettings(); return publicState();
});
ipcMain.handle('dot:avatar', async () => {
  const result = await dialog.showOpenDialog(settingsWindow || panel, { properties: ['openFile'], filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (result.canceled || !result.filePaths[0]) return publicState();
  const file = result.filePaths[0];
  const stat = fs.statSync(file);
  if (stat.size > 3 * 1024 * 1024) throw new Error('3MB 이하 이미지를 선택해 주세요.');
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  settings.avatar = `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
  saveSettings(); return publicState();
});
ipcMain.handle('dot:avatar-clear', () => { settings.avatar = ''; saveSettings(); return publicState(); });
ipcMain.handle('panel:toggle', togglePanel);
ipcMain.handle('panel:height', (_, height) => {
  sizes.panelH = clamp(Math.round(Number(height) || 240), 190, 500);
  if (panel && !panel.isDestroyed()) placePanel();
});
ipcMain.handle('pet:hide', () => setVisible(false));
ipcMain.handle('pet:move', (_, p) => { if (Number.isFinite(p.x) && Number.isFinite(p.y)) setPetBounds(p.x, p.y); });
