const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const { MAX_MESSAGE_LENGTH, normalizeMessage } = require('./message-text');

const snapshotScript = `(() => {
  const editor = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"], textarea');
  if (!window.__moriMessageIds) window.__moriMessageIds = { nodes: new WeakMap(), next: 0 };
  const candidates = [...document.querySelectorAll('[data-message-author-role], [data-role="assistant"], [data-role="user"], [data-testid="assistant-message"], [data-testid="user-message"], .message-list article.message-row[data-message-id]')];
  const messages = candidates.filter(node => !candidates.some(other => other !== node && node.contains(other))).map(node => {
    if (!window.__moriMessageIds.nodes.has(node)) window.__moriMessageIds.nodes.set(node, ++window.__moriMessageIds.next);
    const blocks = [...node.querySelectorAll(node.matches('article.message-row') ? '.message-text' : '.markdown, [data-message-content]')];
    return {
    id: node.getAttribute('data-message-id') || 'node-' + window.__moriMessageIds.nodes.get(node),
    role: node.getAttribute('data-message-author-role') || node.getAttribute('data-role') || (node.matches('article.message-row') ? (node.classList.contains('self') ? 'user' : 'assistant') : node.getAttribute('data-testid') === 'assistant-message' ? 'assistant' : 'user'),
    text: (blocks.filter(block => !blocks.some(other => other !== block && block.contains(other))).map(block => block.innerText || block.textContent).join('\\n') || (node.matches('article.message-row') ? '' : node.innerText || node.textContent) || '').trim()
  }; }).filter(item => item.role === 'user' || item.role === 'assistant');
  const stop = !!document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="응답 중지"], .typing-indicator[data-visible="true"], .typing-bubble[data-active="true"]');
  return { composer: !!editor && !!editor.getClientRects().length && !editor.disabled && editor.getAttribute('aria-disabled') !== 'true', messages, stop, url: location.href, title: document.title };
})()`;

async function snapshot(webContents) {
  let timer;
  try {
    return await Promise.race([
      webContents.executeJavaScript(snapshotScript, true),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('원본 대화 화면이 응답하지 않아요. 원본 대화 열기로 확인해 주세요.')), 8000); })
    ]);
  } finally { clearTimeout(timer); }
}

async function waitForComposer(webContents, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const current = await snapshot(webContents);
    if (current.composer) return current;
    await pause(500);
  }
  throw new Error('닷츠 입력창을 찾지 못했습니다. 로그인 상태와 대화 주소를 확인해 주세요.');
}

const pending = new WeakMap();
async function sendMessage(webContents, text, onUpdate = () => {}) {
  if (pending.has(webContents)) throw new Error('이전 답변을 먼저 확인해 주세요. 원본 대화를 열어서도 확인할 수 있어요.');
  const content = String(text || '').trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) throw new Error(`메시지는 ${MAX_MESSAGE_LENGTH.toLocaleString('ko-KR')}자 이내로 입력해 주세요. 작성한 글은 입력창에 남아 있어요.`);
  const before = await waitForComposer(webContents);
  if (!webContents.debugger.isAttached()) webContents.debugger.attach('1.3');
  const focused = await webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"], textarea');
    if (!editor) return false;
    if (editor.maxLength >= 0 && ${content.length} > editor.maxLength) {
      return { limit: editor.maxLength };
    }
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(editor, '');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      editor.textContent = '';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }
    return true;
  })()`, true);
  if (focused && typeof focused.limit === 'number') throw new Error(`원본 입력창의 글자 수 제한(${focused.limit.toLocaleString('ko-KR')}자)을 초과했어요. 글을 줄여 주세요. 작성한 글은 입력창에 남아 있어요.`);
  if (!focused) throw new Error('닷츠 입력창에 접근하지 못했습니다.');
  await webContents.debugger.sendCommand('Input.insertText', { text: content });
  await pause(250);
  const inserted = await webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"], textarea');
    const normalize = ${normalizeMessage.toString()};
    return !!editor && normalize(editor.value ?? editor.innerText ?? editor.textContent ?? '') === normalize(${JSON.stringify(content)});
  })()`, true);
  if (!inserted) throw new Error('원본 입력창에 글 전체가 들어갔는지 확인하지 못해 전송을 멈췄어요. 작성한 글은 입력창에 남아 있어요.');
  pending.set(webContents, { before, content });
  let clicked = false;
  const clickDeadline = Date.now() + 5000;
  while (!clicked && Date.now() < clickDeadline) {
  clicked = await webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"], textarea');
    const button = document.querySelector('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="메시지 보내기"], button[aria-label="보내기"], button[aria-label="Send"]')
      || editor?.closest('form')?.querySelector('button[type="submit"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`, true);
    if (!clicked) await pause(200);
  }
  if (!clicked) {
    pending.delete(webContents);
    throw new Error('닷츠의 보내기 버튼을 누르지 못했어요. 원본 대화에서 입력창 상태를 확인해 주세요.');
  }
  return receiveReply(webContents, onUpdate);
}

async function receiveReply(webContents, onUpdate = () => {}) {
  const request = pending.get(webContents);
  if (!request) throw new Error('다시 확인할 답변이 없어요.');
  let latest = '', stableSince = 0;
  const until = Date.now() + 45000;
  const confirmationDeadline = Date.now() + 12000;
  while (Date.now() < until) {
    await pause(600);
    const current = await snapshot(webContents);
    const oldIds = new Set(request.before.messages.map(item => item.id));
    const newMessages = current.messages;
    const boundary = newMessages.findLastIndex(item => item.role === 'user' && normalizeMessage(item.text) === normalizeMessage(request.content) && !oldIds.has(item.id));
    if (boundary >= 0 && !request.confirmed) { request.confirmed = true; onUpdate('생각 중…'); }
    if (!request.confirmed && Date.now() >= confirmationDeadline) throw new Error('메시지 전송이 확인되지 않았어요. 원본 대화에서 확인해 주세요. 다시 확인은 재전송하지 않아요.');
    const following = boundary >= 0 ? newMessages.slice(boundary + 1) : [];
    const nextUser = following.findIndex(item => item.role === 'user');
    const replies = nextUser < 0 ? following : following.slice(0, nextUser);
    const last = replies.filter(item => item.role === 'assistant' && item.text).map(item => item.text).join('\n\n');
    if (last) {
      if (last !== latest) { latest = last; stableSince = Date.now(); onUpdate(last); }
      if (Date.now() - stableSince > 4000 && !current.stop) { pending.delete(webContents); return last; }
    }
  }
  throw new Error('답변을 아직 가져오지 못했어요. 답변 다시 확인을 눌러 주세요. 메시지는 다시 보내지 않아요.');
}

module.exports = { snapshot, waitForComposer, sendMessage, receiveReply, hasPending: wc => !!wc && pending.has(wc), clearPending: wc => wc && pending.delete(wc) };
