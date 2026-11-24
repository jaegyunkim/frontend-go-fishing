// 로그인 세션 공용 모듈(app.js, admin.js). 토큰은 sessionStorage(탭을 닫으면 사라짐)에만 둔다.
// 서버가 만료를 최종 판단하고(401 SESSION_EXPIRED), 화면은 남은 시간을 세어 0초에 자동 로그아웃한다.
const KEY = 'gofishing.auth';
const params = new URLSearchParams(location.search);
if (params.get('api')) localStorage.setItem('gofishing.api', params.get('api').replace(/\/$/, ''));
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const state = {
  api: localStorage.getItem('gofishing.api') || window.GOFISHING_API || (isLocal ? 'http://localhost:8787' : ''),
  authMode: null,                 // 'required' | 'off' | null(서버 미연결)
  sessionMinutes: 10,
  dailySessions: 1,               // 베타 테스터 기본 하루(24시간) 로그인 횟수(서버 /healthz)
  auth: JSON.parse(sessionStorage.getItem(KEY) || 'null') // { token, expiresAtLocal, user }
};
// 외부 수집기가 없거나 고장 나도 인증/요청 동작은 그대로 유지한다.
function telemetry(kind, message, actualBase = state.api) {
  try { window.GOFISHING_TELEMETRY?.report(kind, message, '', actualBase); } catch { /* best effort */ }
}
function syncTelemetryBase() {
  try { window.GOFISHING_TELEMETRY?.setApiBase(state.api); } catch { /* best effort */ }
}
syncTelemetryBase();
export function setApi(v) { state.api = String(v || '').trim().replace(/\/$/, ''); localStorage.setItem('gofishing.api', state.api); syncTelemetryBase(); }
export function saveAuth(a) { state.auth = a; if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); }
/** 서버가 알려 준 남은 초로 로컬 만료 시각을 맞춘다(기기 시계가 틀려도 안전). */
export function syncExpiry(remainingSec) { if (state.auth && Number.isFinite(remainingSec)) saveAuth({ ...state.auth, expiresAtLocal: Date.now() + remainingSec * 1000 }); }
/** 이 계정의 세션 시간(분). 관리자가 계정별로 바꿀 수 있다. */
export const sessionMinutes = () => state.auth?.minutes ?? state.auth?.user?.limits?.sessionMinutes ?? state.sessionMinutes;
/** 베타 테스터의 24시간 로그인 현황 { limit, used, left, nextAt? } (관리자·내부 테스터는 null) */
export const loginQuota = () => state.auth?.user?.role === 'user' ? state.auth?.logins ?? null : null;
/** 횟수를 우리말로: 1 → 한 번, 2 → 두 번 … 11 이상은 숫자 */
export const timesKo = v => { const k = Math.trunc(Number(v)); return ((['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'])[k] ?? k.toLocaleString('ko-KR')) + ' 번'; };
export const remaining = () => state.auth ? Math.max(0, Math.round((state.auth.expiresAtLocal - Date.now()) / 1000)) : 0;

// API 실패 안내 문구. 백엔드 오류 형식은 {"error": "...", "code": "..."}.
// - 응답을 못 받음(오프라인·서버 꺼짐·시간 초과): 연결 문제임을 알리고 재시도 안내.
// - 5xx + code(예: 503 DB_UNAVAILABLE): 코드별 안내, 모르는 코드는 일반 안내.
// - code 가 없거나 4xx: 기존 동작 유지(서버가 준 error 문구 그대로).
export const RETRY_TAIL = '잠시 후 다시 시도해 주세요. 계속되면 운영자에게 알려 주세요.';
const ERROR_BY_CODE = { DB_UNAVAILABLE: `지금 서비스 저장소에 잠시 연결할 수 없어요. ${RETRY_TAIL}` };
export function friendlyHttpError(status, code) {
  if (!code || !(status >= 500)) return null;
  return ERROR_BY_CODE[code] ?? `서버가 요청을 잠시 처리하지 못했어요. ${RETRY_TAIL}`;
}
export const friendlyNetworkError = timeout => timeout ? `서버 응답이 늦어지고 있어요. ${RETRY_TAIL}` : `서버에 연결하지 못했어요. 인터넷 연결을 확인하고 ${RETRY_TAIL}`;

let onAuthLost = () => {};
export function setOnAuthLost(fn) { onAuthLost = fn; }
let onMustChange = () => {};
export function setOnMustChange(fn) { onMustChange = fn; }

export async function api(path, opts = {}) {
  if (!state.api) throw Object.assign(new Error('백엔드 주소가 설정되지 않았어요'), { status: 0 });
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.auth?.token && !opts.noAuth) headers.Authorization = `Bearer ${state.auth.token}`;
  const requestBase = state.api;
  syncTelemetryBase();
  let r;
  try { r = await fetch(requestBase + path, { ...opts, headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 60000) }); }
  catch (e) {
    telemetry('api_network', e?.name === 'TimeoutError' ? 'API request timed out' : 'API network request failed', requestBase);
    const local = /\/\/(localhost|127\.0\.0\.1)/.test(state.api) && location.protocol === 'https:';
    const timeout = e?.name === 'TimeoutError';
    throw Object.assign(new Error(timeout && local ? '로컬 서버 응답 없음 — 브라우저의 “로컬 네트워크 접근 허용” 팝업을 확인하거나 HTTPS 공개 주소를 쓰세요' : friendlyNetworkError(timeout)), { status: 0, code: timeout ? 'TIMEOUT' : 'NETWORK', friendly: true });
  }
  if (r.status >= 500) telemetry('api_5xx', `HTTP ${r.status}`, requestBase);
  const j = await r.json().catch(() => { telemetry('api_json', 'API response JSON parsing failed', requestBase); return {}; });
  if (!r.ok) {
    const nice = friendlyHttpError(r.status, j.code);
    const e = Object.assign(new Error(nice || j.error || `HTTP ${r.status}`), { status: r.status, code: j.code, usage: j.usage, friendly: !!nice, serverError: j.error, retryAfter: Number(r.headers?.get?.('Retry-After')) || undefined });
    if (r.status === 401 && state.auth && !opts.noAuth) onAuthLost(e.message, e.code);
    if (r.status === 403 && j.code === 'MUST_CHANGE_PASSWORD') onMustChange();
    throw e;
  }
  return j;
}
/** 인증이 필요한 이미지(네이버 정적 지도)를 Blob URL 로 받아 img 에 넣는다. */
export async function loadAuthImage(img, path) {
  try {
    const r = await fetch(state.api + path, { headers: state.auth?.token ? { Authorization: `Bearer ${state.auth.token}` } : {} });
    if (!r.ok) throw new Error(String(r.status));
    img.src = URL.createObjectURL(await r.blob());
  } catch { img.alt = '지도를 불러오지 못했어요'; }
}
async function probe() {
  const h = await api('/healthz', { timeoutMs: 8000, noAuth: true });
  state.authMode = h.auth?.mode ?? 'off'; state.sessionMinutes = h.auth?.sessionMinutes ?? 10; state.dailySessions = h.auth?.dailySessions ?? 1;
  return h;
}
/** 서버 상태 확인. 기본 주소(config.js)가 안 되면 예비 주소를 차례로 시도한다(기기에 직접 저장한 주소는 그대로 존중). */
export async function health() {
  try { return await probe(); } catch (e) {
    const fromConfig = !localStorage.getItem('gofishing.api');
    const backups = fromConfig ? (window.GOFISHING_API_FALLBACKS || []).filter(u => u && u !== state.api) : [];
    const primary = state.api;
    for (const u of backups) { state.api = u; try { return await probe(); } catch { /* 다음 예비 주소 */ } }
    state.api = primary; syncTelemetryBase(); state.authMode = null; return { error: e.message, friendly: !!e.friendly };
  }
}
export async function login(loginId, password) {
  const r = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password, client: 'pages' }), noAuth: true });
  saveAuth({ token: r.token, expiresAtLocal: Date.now() + r.session.minutes * 60000, minutes: r.session.minutes, user: r.user, logins: r.logins ?? null });
  return r;
}
export async function logout(reason = 'logout') {
  const a = state.auth; saveAuth(null);
  if (a?.token) fetch(state.api + '/v1/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => {});
}
/** 1초 타이머: 표시 갱신, 60초 전 경고, 0초 자동 로그아웃. 탭이 다시 보일 때 즉시 확인. */
export function startTimer(el, { onWarn, onExpire }) {
  let warned = false;
  const tick = () => {
    if (!state.auth) return;
    const s = remaining();
    el.hidden = false; el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('warn', s <= 120 && s > 60); el.classList.toggle('crit', s <= 60);
    if (s <= 60 && !warned) { warned = true; onWarn?.(s); }
    if (s <= 0) { stop(); onExpire?.(); }
  };
  const id = setInterval(tick, 1000);
  const vis = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', vis);
  function stop() { clearInterval(id); document.removeEventListener('visibilitychange', vis); el.hidden = true; }
  tick();
  return { stop, reset() { warned = false; tick(); } };
}
