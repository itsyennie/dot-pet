const app = document.getElementById('app');
const view = new URLSearchParams(location.search).get('view') || 'bubble';
document.body.className = view;
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultCharacter = '<img draggable="false" class="character" src="../assets/mori-rabbit.png" alt="">';
let state = null;
const avatar = extra => state?.avatar ? `<img draggable="false" class="custom-avatar ${extra || ''}" src="${state.avatar}" alt="">` : defaultCharacter;

if (view === 'pet') {
  app.innerHTML = '<div class="pet-wrap" role="button" tabindex="0" aria-label="모리와 대화"></div>';
  const wrap = app.firstElementChild;
  const paint = () => { wrap.innerHTML = avatar(); wrap.setAttribute('aria-label', `${state?.dotName || '모리'}와 대화`); };
  let start = null, dragged = false;
  wrap.addEventListener('dragstart', e => e.preventDefault());
  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    start = { id: e.pointerId, px: e.screenX, py: e.screenY, x: window.screenX, y: window.screenY };
    dragged = false; wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.screenX - start.px, dy = e.screenY - start.py;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragged = true;
    if (dragged) window.mori.move(start.x + dx, start.y + dy);
  });
  wrap.addEventListener('pointerup', e => {
    if (!start || e.pointerId !== start.id) return;
    const wasDragged = dragged;
    start = null;
    if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    if (!wasDragged) {
      const c = wrap.firstElementChild;
      c.classList.remove('reaction'); void c.offsetWidth; c.classList.add('reaction');
      window.mori.togglePanel();
    }
  });
  const cancelDrag = () => { start = null; dragged = false; };
  wrap.addEventListener('pointercancel', cancelDrag);
  wrap.addEventListener('lostpointercapture', cancelDrag);
  wrap.addEventListener('contextmenu', e => { e.preventDefault(); window.mori.showSettings(); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') window.mori.togglePanel(); });
  window.mori.onState(s => { state = s; paint(); });
  window.mori.getState().then(s => { state = s; paint(); });
} else if (view === 'incoming') {
  app.innerHTML = '<div class="incoming-card"><button class="incoming-dismiss" aria-label="알림 닫기">×</button><button class="incoming-open"><strong class="incoming-name"></strong><span class="incoming-text"></span><span class="incoming-hint">눌러서 대화하기</span></button></div>';
  const card = app.firstElementChild;
  window.mori.onIncoming(message => {
    card.classList.toggle('below', message.below);
    card.style.setProperty('--tip', `${message.tip - 8}px`);
    card.querySelector('.incoming-name').textContent = message.name;
    card.querySelector('.incoming-text').textContent = message.text;
  });
  card.querySelector('.incoming-open').onclick = () => window.mori.openIncoming();
  card.querySelector('.incoming-dismiss').onclick = () => window.mori.dismissIncoming();
} else if (view === 'bubble') {
  let messages = [], sending = false, notice = '', canRetry = false;
  app.innerHTML = '<div class="bubble-stage"><div class="bubble-feed" id="feed"></div><div class="bubble-bottom" id="bottom"></div></div>';
  const feed = document.getElementById('feed'), bottom = document.getElementById('bottom');
  let resizeFrame = 0;
  function scheduleSize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const rows = [...feed.children];
      const feedHeight = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) + Math.max(0, rows.length - 1) * 9 + 18;
      const height = Math.ceil(9 + Math.min(feedHeight, 340) + 9 + bottom.getBoundingClientRect().height + 12);
      window.mori.setPanelHeight(height);
    });
  }
  function renderMessages() {
    feed.innerHTML = messages.length
      ? messages.slice(-30).map(m => `<div class="speech ${m.role}">${esc(m.text || (m.role === 'assistant' ? '전송 확인 중…' : ''))}</div>`).join('')
      : `<div class="speech assistant">안녕! 나 여기 있어 👋<br>연결되면 이 말풍선에서 바로 이야기하자.</div>`;
    if (notice) feed.innerHTML += `<div class="speech system">${esc(notice)}</div>`;
    if (canRetry && !sending) {
      const retry = document.createElement('button');
      retry.className = 'connect-pill'; retry.textContent = '답변 다시 확인';
      retry.onclick = async () => {
        sending = true; notice = '답변을 다시 확인하고 있어요…'; renderMessages();
        try {
          const result = await window.mori.receiveDot();
          if (result.ok) { messages.at(-1).text = result.text; canRetry = false; notice = ''; }
          else { canRetry = result.retryable; notice = result.message; }
        }
        catch (error) { canRetry = false; notice = '연결이 끊겼어요. 원본 대화를 열어 확인해 주세요.'; }
        finally { sending = false; renderMessages(); }
      };
      feed.appendChild(retry);
    }
    feed.scrollTop = feed.scrollHeight;
    scheduleSize();
  }
  function render() {
    if (!state) return;
    const draft = document.getElementById('message')?.value || '';
    renderMessages();
    if (state.bridgeStatus === 'ready') {
      bottom.innerHTML = '<div class="compose-pill"><textarea id="message" rows="1" maxlength="4000" placeholder="모리에게 말 걸기…"></textarea><button class="compose-settings" id="settings" title="설정" aria-label="설정">⚙</button><button id="send" aria-label="보내기">➤</button></div><button class="open-original" id="original">원본 대화 열기 ↗</button>';
      document.getElementById('message').value = draft;
      document.getElementById('send').onclick = send;
      document.getElementById('message').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    } else {
      const label = state.bridgeStatus === 'connecting' ? '연결 확인 중…' : '모리 대화 연결하기';
      bottom.innerHTML = `<div class="connect-row"><button class="connect-pill" id="connect" ${state.bridgeStatus === 'connecting' ? 'disabled' : ''}>${label}</button><button class="compose-settings" id="settings" title="설정" aria-label="설정">⚙</button></div><button class="open-original" id="original">원본 대화 열기 ↗</button>`;
      document.getElementById('connect').onclick = connect;
    }
    document.getElementById('original').onclick = () => window.mori.showChat();
    document.getElementById('settings').onclick = () => window.mori.showSettings();
    scheduleSize();
  }
  async function connect() {
    notice = ''; state.bridgeStatus = 'connecting'; render();
    try {
      const result = await window.mori.connectDot();
      if (result.ok) { messages = result.messages.map(m => ({ role: m.role, text: m.text })); notice = ''; canRetry = false; }
      else notice = result.message;
      state = await window.mori.getState(); render();
    } catch (error) {
      notice = 'ChatGPT 창에서 로그인한 뒤 여기서 다시 연결해 주세요. 연결이 계속 안 되면 원본 대화를 사용해 주세요.';
      state = await window.mori.getState(); render();
    }
  }
  async function send() {
    const input = document.getElementById('message');
    const text = input?.value.trim();
    if (!text || sending) return;
    if (canRetry) { notice = '이전 답변을 먼저 확인해 주세요.'; renderMessages(); return; }
    sending = true; canRetry = false; notice = '';
    messages.push({ role: 'user', text }, { role: 'assistant', text: '' });
    input.value = ''; renderMessages();
    try {
      const result = await window.mori.sendDot(text);
      if (result.ok) messages.at(-1).text = result.text;
      else {
        canRetry = result.retryable; notice = result.message;
        if (!messages.at(-1).text || messages.at(-1).text === '생각 중…') messages.at(-1).text = canRetry ? '답변을 아직 확인하지 못했어요.' : '전송 여부를 확인해 주세요.';
      }
    } catch (error) {
      if (!messages.at(-1).text || messages.at(-1).text === '생각 중…') messages.at(-1).text = '답변을 확인하지 못했어요.';
      canRetry = false; notice = '연결이 끊겼어요. 원본 대화를 열어 확인해 주세요.';
    } finally { sending = false; renderMessages(); }
  }
  window.mori.onChunk(text => { if (sending && messages.at(-1)?.role === 'assistant') { messages[messages.length - 1].text = text; renderMessages(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.mori.togglePanel(); });
  let refreshing = false;
  async function refreshHistory() {
    if (refreshing || sending || canRetry || state?.bridgeStatus !== 'ready' || document.visibilityState !== 'visible') return;
    refreshing = true;
    try {
      const history = await window.mori.getHistory();
      if (sending || canRetry || state?.bridgeStatus !== 'ready') return;
      const next = history.filter(m => m.text).map(m => ({ role: m.role, text: m.text }));
      if (next.length && JSON.stringify(next) !== JSON.stringify(messages)) { messages = next; notice = ''; renderMessages(); }
    } catch { /* The connect/send action surfaces actionable errors. */ }
    finally { refreshing = false; }
  }
  window.mori.onState(s => {
    const shouldRender = !state || s.bridgeStatus !== state.bridgeStatus || s.dotName !== state.dotName || s.avatar !== state.avatar;
    state = s; if (shouldRender) { render(); refreshHistory(); }
  });
  document.addEventListener('visibilitychange', refreshHistory);
  setInterval(refreshHistory, 2000);
  window.mori.getState().then(s => { state = s; render(); refreshHistory(); });

} else {
  let notice = '';
  app.innerHTML = '<div class="shell"><div class="header"><div class="badge">♡</div><div class="title">모리 꾸미기</div><button class="icon-btn" id="close">×</button></div><div class="settings" id="settings"></div></div>';
  const screen = document.getElementById('settings');
  function render() {
    if (!state) return;
    screen.innerHTML = `<p class="small">닷츠에서 쓰는 이름과 캐릭터 이미지를 직접 맞춰 주세요.</p><label for="name">이름</label><input id="name" maxlength="40" value="${esc(state.dotName)}"><label for="url">닷츠 대화 주소</label><input id="url" type="url" value="${esc(state.dotUrl)}"><button class="primary" id="save">저장</button><div class="status">${esc(notice)}</div><label>캐릭터 이미지</label><div class="avatar-picker">${avatar('preview')}<div><button id="chooseAvatar">이미지 선택</button><button id="clearAvatar">기본 캐릭터</button></div></div><p class="small">PNG, JPG, WebP · 최대 3MB</p><label for="size">크기</label><input id="size" type="range" min="0.7" max="1.7" step="0.1" value="${state.scale}"><label class="check"><input id="startup" type="checkbox" ${state.startup ? 'checked' : ''}> Windows 시작 시 실행</label><button id="hidePet">캐릭터 잠시 숨기기</button><p class="small">대화 연결은 ChatGPT 웹 화면을 이용합니다. 웹 화면 변경 시 작동하지 않을 수 있습니다.</p>`;
    const byId = id => document.getElementById(id);
    byId('save').onclick = async () => { try { state = await window.mori.saveDot(byId('name').value, byId('url').value); notice = '저장했어요 ✓'; } catch (e) { notice = e.message; } render(); };
    byId('chooseAvatar').onclick = async () => { try { state = await window.mori.chooseAvatar(); notice = ''; } catch (e) { notice = e.message; } render(); };
    byId('clearAvatar').onclick = async () => { state = await window.mori.clearAvatar(); render(); };
    byId('size').oninput = e => window.mori.setScale(e.target.value);
    byId('startup').onchange = e => window.mori.setStartup(e.target.checked);
    byId('hidePet').onclick = () => window.mori.hide();
  }
  document.getElementById('close').onclick = () => window.mori.hideSettings();
  window.mori.onState(s => { state = s; render(); });
  window.mori.getState().then(s => { state = s; render(); });
}
