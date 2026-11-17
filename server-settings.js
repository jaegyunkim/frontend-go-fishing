import {state, api, saveAuth, setApi, logout, startTimer, syncExpiry, setOnAuthLost} from './auth.js?v=1.16.9';
const form = document.querySelector('#connection'), status = document.querySelector('#status');
let verified = false;
function deny(message) { verified = false; form.hidden = true; status.textContent = message; }
setOnAuthLost(() => { saveAuth(null); deny('로그인이 만료됐습니다. 다시 로그인해 주십시오.'); });
async function verify() {
  if (!state.auth?.token) throw new Error('관리자 lonbehold 계정으로 로그인한 뒤 접근해 주십시오.');
  const me = await api('/v1/auth/me');
  if (me.role !== 'admin' || me.user?.loginId !== 'lonbehold' || me.mustChangePassword) throw new Error('관리자 lonbehold 계정만 접근할 수 있습니다. 비밀번호 변경이 필요한 경우 먼저 완료해 주십시오.');
  syncExpiry(me.remainingSec); return me;
}
try {
  await verify(); verified = true; form.hidden = false; status.textContent = '관리자 lonbehold 인증 완료';
  document.querySelector('#address').value = state.api;
  startTimer(document.querySelector('#timer'), {onExpire: () => { logout('expired'); deny('세션이 만료됐습니다. 다시 로그인해 주십시오.'); }});
} catch (e) { deny(e.message); }
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!verified) return;
  try {
    await verify();
    const url = new URL(document.querySelector('#address').value.trim());
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('HTTPS 서버 기본 주소를 입력하십시오. 로컬 서버만 HTTP를 허용합니다.');
    await logout(); setApi(url.origin); location.replace('./');
  } catch (e) { status.textContent = e.message; }
});
