const { waitForComposer } = require('./dot-bridge');
function isDotUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && (url.pathname === '/dots' || url.pathname.startsWith('/dots/')); } catch { return false; }
}
async function connectPage(wc, destination, wait = waitForComposer) {
  if (!isDotUrl(wc.getURL())) {
    let timer;
    try { await Promise.race([
      wc.loadURL(destination),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('대화 페이지 로딩이 오래 걸리고 있어요. 열린 창에서 상태를 확인한 뒤 다시 연결해 주세요.')), 30000); })
    ]); } catch (error) {
      if (error.code !== 'ERR_ABORTED' && error.errno !== -3) throw error;
    } finally { clearTimeout(timer); }
  }
  const current = await wait(wc, 30000);
  if (!isDotUrl(current.url)) throw new Error('열린 창에서 로그인한 뒤 모리의 닷츠 대화를 열고 다시 연결해 주세요.');
  return current;
}
module.exports = { isDotUrl, connectPage };
