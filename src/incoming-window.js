const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const { notificationBounds } = require('./incoming');

function createIncomingWindow({ pet, canShow, name, duration = 15000 }) {
  const window = new BrowserWindow({ show: false, width: 300, height: 174, frame: false,
    transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  let content = null, timer, revision = 0;
  const ready = window.loadFile(path.join(__dirname, 'index.html'), { query: { view: 'incoming' } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  function place() {
    if (!content || window.isDestroyed()) return;
    const bounds = notificationBounds(pet.getBounds(), screen.getDisplayMatching(pet.getBounds()).workArea);
    const { below, tip, ...rectangle } = bounds;
    window.setBounds(rectangle);
    window.webContents.send('incoming:message', { ...content, below, tip });
  }
  function hide() { revision++; clearTimeout(timer); content = null; if (!window.isDestroyed()) window.hide(); }
  async function show(text) {
    if (!canShow()) return;
    const request = ++revision;
    try { await ready; } catch { return; }
    if (request !== revision || window.isDestroyed() || !canShow()) return;
    content = { name: name(), text: text.slice(0, 1000) };
    place(); window.showInactive();
    clearTimeout(timer); timer = setTimeout(hide, duration);
  }
  window.on('closed', () => { revision++; clearTimeout(timer); });
  return { window, show, hide, place };
}
module.exports = { createIncomingWindow };
