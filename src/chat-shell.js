document.getElementById('home').onclick = () => window.mori.navigateChat('home');
document.getElementById('dot').onclick = () => window.mori.navigateChat('dot');
document.getElementById('browser').onclick = () => window.mori.openDot();

document.getElementById('connect').onclick = async () => {
  const button = document.getElementById('connect'); button.disabled = true; button.textContent = '확인 중…';
  try { const result = await window.mori.connectDot();
    button.textContent = result.ok ? '연결됨 ✓' : '다시 확인';
    button.title = result.ok ? '모리 캐릭터를 클릭해서 대화하세요.' : result.message;
  } catch { button.textContent = '다시 확인'; }
  finally { button.disabled = false; }
};
