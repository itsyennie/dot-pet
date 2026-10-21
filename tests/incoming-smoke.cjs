// Runs the actual main process and UI with an isolated profile and an offline inbox.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dot-pet-incoming-')));
let inbox = [{ id: 'old', role: 'assistant', text: '과거 메시지' }];
let reads = 0;
const current = () => ({ composer: true, stop: false, url: 'https://chatgpt.com/dots/home', messages: inbox.map(m => ({ ...m })) });
const bridge = require('../src/dot-bridge');
bridge.snapshot = async () => { reads++; return current(); };
const connection = require('../src/connection');
connection.isDotUrl = () => true;
connection.connectPage = async () => current();
const errors = [];
app.on('web-contents-created', (_, wc) => {
  const loadURL = wc.loadURL.bind(wc);
  wc.loadURL = (url, ...args) => url.startsWith('https://') ? wc.loadFile(path.join(__dirname, 'mock-dot.html')) : loadURL(url, ...args);
  wc.on('preload-error', (_, file, error) => errors.push(error.message));
  wc.on('render-process-gone', (_, details) => errors.push(details.reason));
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 16000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await predicate()) return; await pause(100); }
  throw new Error('Condition timed out');
}
require('../src/main');
app.whenReady().then(async () => {
  try {
    await waitFor(() => reads >= 3);
    const find = view => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes(`view=${view}`));
    const incoming = find('incoming'), pet = find('pet'), panel = find('bubble');
    assert.ok(incoming && pet && panel);
    assert.equal(incoming.isVisible(), false, 'old history should not notify');
    const focusTarget = new BrowserWindow({ width: 360, height: 120, show: true });
    await focusTarget.loadURL('data:text/html,<p>Notification focus test</p>');
    focusTarget.focus();
    await waitFor(() => focusTarget.isFocused());
    inbox.push({ id: 'new', role: 'assistant', text: '잠깐 쉬어갈래? 나 여기 있어 🌿' });
    await waitFor(() => incoming.isVisible());
    assert.equal(panel.isVisible(), false);
    assert.equal(focusTarget.isFocused(), true, 'notification must not steal focus');
    assert.equal(await incoming.webContents.executeJavaScript("document.querySelector('.incoming-text').textContent"), inbox.at(-1).text);
    const output = path.join(__dirname, '../.test-results');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'incoming.png'), (await incoming.webContents.capturePage()).toPNG());
    console.log('PASS: background polling shows a new reply without a click and preserves focus');
    await waitFor(() => !incoming.isVisible(), 17000);
    await pause(3500);
    assert.equal(incoming.isVisible(), false, 'same reply must not reappear');
    console.log('PASS: automatic dismissal and duplicate suppression');
    inbox.push({ id: 'next', role: 'assistant', text: '말풍선을 누르면 대화가 열려요.' });
    await waitFor(() => incoming.isVisible());
    await incoming.webContents.executeJavaScript("document.querySelector('.incoming-open').click()");
    await waitFor(() => panel.isVisible() && !incoming.isVisible());
    await pet.webContents.executeJavaScript('window.mori.hide()');
    inbox.push({ id: 'hidden', role: 'assistant', text: '숨김 중 알림은 표시하지 않아요.' });
    await pause(10000);
    assert.equal(incoming.isVisible(), false);
    assert.equal(pet.isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: click opens chat; hiding the pet suppresses notifications; no renderer errors');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Smoke test timeout'); app.exit(1); }, 80000);
