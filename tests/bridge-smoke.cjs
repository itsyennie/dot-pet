const { app, BrowserWindow, WebContentsView } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { sendMessage, hasPending } = require('../src/dot-bridge');
app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dot-pet-test-')));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 500, height: 400, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 500, height: 400 });
  let exitCode = 0;
  try {
    await view.webContents.loadFile(path.join(__dirname, 'mock-dot.html'));
    const answer = await sendMessage(view.webContents, '안녕');
    if (answer !== '반가워!') throw new Error('first reply mismatch');
    const repeated = await sendMessage(view.webContents, '한 번 더');
    if (repeated !== '반가워!') throw new Error('identical reply missed');
    await view.webContents.executeJavaScript(`document.querySelector('button').onclick = () => {
      const input = document.querySelector('#prompt-textarea');
      const user = document.createElement('div'); user.dataset.role = 'user'; user.textContent = input.innerText;
      document.querySelector('#messages').append(user); input.textContent = '';
      setTimeout(() => { const reply = document.createElement('div'); reply.dataset.testid = 'assistant-message';
        reply.innerHTML = '<div class="markdown">첫 문단</div><div class="markdown">둘째 문단</div>'; document.querySelector('#messages').append(reply); }, 150);
    }; undefined`);
    const multi = await sendMessage(view.webContents, '문단 테스트');
    if (multi !== '첫 문단\n둘째 문단') throw new Error('multi-block mismatch: ' + multi);
    await view.webContents.executeJavaScript(`document.querySelector('#messages').className = 'message-list';
      document.querySelector('button').onclick = () => {
        const input = document.querySelector('#prompt-textarea'), list = document.querySelector('#messages');
        const user = document.createElement('article');user.className='message-row self';user.dataset.messageId='dot-user';
        const text = document.createElement('div');text.className='message-text';text.textContent=input.innerText;user.append(text);list.append(user);input.textContent='';
        const typing=document.createElement('div');typing.className='typing-indicator';typing.dataset.visible='true';list.append(typing);
        const add=(id,content)=>{const row=document.createElement('article');row.className='message-row';row.dataset.messageId=id;
          row.innerHTML='<div class="message-meta">시간</div><div class="message-body"><div class="message-text">'+content+'</div><div class="message-inline-actions">복사</div></div>';list.append(row);};
        add('dot-first','첫 말풍선');setTimeout(()=>{add('dot-second','둘째 말풍선');typing.dataset.visible='false';},5000);
      }; undefined`);
    const dot = await sendMessage(view.webContents, '닷츠 구조 테스트');
    if (dot !== '첫 말풍선\n\n둘째 말풍선') throw new Error('Dot grouped reply mismatch: '+dot);
    await view.webContents.executeJavaScript("document.querySelector('button').disabled=true; undefined");
    try { await sendMessage(view.webContents, '전송 차단 테스트'); throw new Error('disabled button accepted'); }
    catch (error) { if (!error.message.includes('보내기 버튼')) throw error; }
    if (hasPending(view.webContents)) throw new Error('disabled button left pending state');
    console.log('PASS: hidden window, repeated replies, Dot markup, grouped bubbles, delayed typing, disabled send button');
  } catch (error) {
    console.error(error.stack); exitCode = 1;
  } finally { app.exit(exitCode); }
});
