// 접속 카운터: 메인(로그인)·이용 신청 화면을 열면 서버에 한 번 알린다(같은 IP·같은 화면·같은 날은 서버가 1명으로 셈).
// 실패해도 화면 사용에는 영향이 없도록 조용히 넘긴다.
import { api } from './auth.js?v=1.30.0';
export const pageOf = path => /\/register(\.html)?$/.test(String(path)) ? 'register' : 'main';
export function countVisit(page, call = api) {
  try { return Promise.resolve(call('/v1/visits', { method: 'POST', body: JSON.stringify({ page }), timeoutMs: 5000 })).then(() => true, () => false); }
  catch { return Promise.resolve(false); }
}
// 미리 렌더링(prerender) 중에는 세지 않고, 실제로 화면에 보일 때 센다
if (typeof document !== 'undefined') {
  const go = () => countVisit(pageOf(location.pathname));
  if (document.prerendering) document.addEventListener('prerenderingchange', go, { once: true }); else go();
}
