const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sendMessage, snapshot, hasPending } = require('../src/dot-bridge');
const { normalizeMessage } = require('../src/message-text');
app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dot-pet-long-')));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await pause(100); }
  throw new Error('Condition timed out');
}
app.whenReady().then(async () => {
  try {
    const remote = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const wc = remote.webContents;
    await wc.loadFile(path.join(__dirname, 'mock-dot.html'));
    let sends = 0;
    let bubble;
    ipcMain.handle('state:get', () => ({ bridgeStatus: 'ready', dotName: '모리', avatar: '' }));
    ipcMain.handle('panel:height', () => {});
    ipcMain.handle('dot:history', async () => (await snapshot(wc)).messages);
    ipcMain.handle('dot:send', async (_, text) => {
      sends++;
      try { return { ok: true, text: await sendMessage(wc, text, chunk => bubble.webContents.send('bridge:chunk', chunk)) }; }
      catch (error) { return { ok: false, message: error.message, retryable: hasPending(wc) }; }
    });
    bubble = new BrowserWindow({ show: true, width: 370, height: 500, webPreferences: { preload: path.join(__dirname, '../src/preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await bubble.loadFile(path.join(__dirname, '../src/index.html'), { query: { view: 'bubble' } });
    const ui = script => bubble.webContents.executeJavaScript(script);
    await waitFor(() => ui("!!document.querySelector('#message')"));
    assert.equal(await ui("document.querySelector('#message').maxLength"), -1);
    const long = ('긴 글 전송 테스트 🌿 "인용"\r\n둘째 줄\r\n\r\n').repeat(400);
    assert.ok(long.length > 10000);
    await ui("document.querySelector('#message').focus()");
    bubble.webContents.debugger.attach('1.3');
    await bubble.webContents.debugger.sendCommand('Input.insertText', { text: long });
    const draft = await ui("document.querySelector('#message').value");
    assert.equal(normalizeMessage(draft), normalizeMessage(long));
    await wc.executeJavaScript("document.querySelector('button').disabled=true");
    await ui("document.querySelector('#send').click()");
    await waitFor(() => ui("document.querySelector('#send').disabled"));
    assert.equal(await ui("document.querySelector('#message').value"), draft, 'draft cleared before acknowledgement');
    await waitFor(() => ui("!document.querySelector('#send').disabled"));
    await pause(2500);
    assert.equal(await ui("document.querySelector('#message').value"), draft);
    assert.ok(await ui("document.querySelector('#feed').textContent.includes('보내기 버튼')"), 'error disappeared during history refresh');
    assert.equal(hasPending(wc), false);
    await wc.executeJavaScript("document.querySelector('button').disabled=false");
    await ui("document.querySelector('#send').click()");
    await waitFor(() => ui("document.querySelector('#send').disabled"));
    await waitFor(() => ui("!document.querySelector('#send').disabled"));
    assert.equal(await ui("document.querySelector('#message').value"), '');
    assert.equal(normalizeMessage((await snapshot(wc)).messages.find(m => m.role === 'user').text), normalizeMessage(long));
    assert.ok(await ui("document.querySelector('#feed').textContent.includes('반가워!')"));
    console.log('PASS: 10,000+ character paste, failed-send draft preservation, persistent error, retry and confirmed send');
    const before = sends;
    await ui("document.querySelector('#message').value='가'.repeat(50001);document.querySelector('#message').dispatchEvent(new Event('input'));document.querySelector('#send').click()");
    assert.equal(sends, before);
    assert.equal(await ui("document.querySelector('#message').value.length"), 50001);
    assert.ok(await ui("document.querySelector('#feed').textContent.includes('50,000')"));
    // Simulate a source textarea whose rendered user row normalizes whitespace.
    await wc.executeJavaScript(`document.querySelector('#prompt-textarea').outerHTML='<textarea id="prompt-textarea"></textarea>';
      document.querySelector('button').onclick=()=>{const e=document.querySelector('#prompt-textarea');
      const u=document.createElement('div');u.dataset.messageAuthorRole='user';u.textContent=e.value.replace(/\\s+/g,' ');document.querySelector('#messages').append(u);e.value='';
      const a=document.createElement('div');a.dataset.messageAuthorRole='assistant';a.textContent='긴 문장 확인';document.querySelector('#messages').append(a);}; undefined`);
    assert.equal(await sendMessage(wc, long), '긴 문장 확인');
    await wc.executeJavaScript("document.querySelector('#prompt-textarea').maxLength=100");
    await assert.rejects(() => sendMessage(wc, long), /글자 수 제한/);
    assert.equal(hasPending(wc), false);
    console.log('PASS: visible 50,000 character validation, multiline whitespace normalization, source limit without partial send');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Timeout'); app.exit(1); }, 60000);
