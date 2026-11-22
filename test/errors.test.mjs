// API 실패 문구 구분(auth.js): 네트워크·시간 초과·5xx+code 는 친절한 문구, code 없음·4xx 는 기존 문구 유지.
// 실제 서버로 요청하지 않고 fetch 를 가짜로 바꿔 시험한다.
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const authSource = fs.readFileSync(new URL('../auth.js', import.meta.url), 'utf8').replace(/export /g, '');
function load(fetchImpl, hostname = 'frontend.test') {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ window: { GOFISHING_API: 'https://api.test' }, location: { search: '', hostname, protocol: 'https:' }, localStorage: storage, sessionStorage: storage,
    URLSearchParams, Object, Error, Promise, AbortSignal, Date, fetch: fetchImpl });
  vm.runInContext(authSource, ctx);
  return vm.runInContext('({ api, health, friendlyHttpError, RETRY_TAIL })', ctx);
}
const res = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('503 DB_UNAVAILABLE 은 저장소 연결 안내 + 재시도·운영자 안내', async () => {
  const a = load(res(503, { error: 'db down', code: 'DB_UNAVAILABLE' }));
  await assert.rejects(a.api('/v1/x'), e => e.status === 503 && e.code === 'DB_UNAVAILABLE' && e.friendly && /저장소/.test(e.message) && e.message.endsWith(a.RETRY_TAIL) && e.serverError === 'db down');
});
test('모르는 코드의 5xx 는 일반 안내', async () => {
  const a = load(res(502, { error: 'x', code: 'SOMETHING_NEW' }));
  await assert.rejects(a.api('/v1/x'), e => e.friendly && e.message.includes('잠시 후 다시 시도해 주세요'));
});
test('code 없는 5xx 는 기존 동작 유지(서버 문구 그대로)', async () => {
  const a = load(res(500, { error: '서버 처리 오류' }));
  await assert.rejects(a.api('/v1/x'), e => e.message === '서버 처리 오류' && !e.friendly);
});
test('4xx 는 code 가 있어도 서버 문구 유지', async () => {
  const a = load(res(429, { error: '오늘 질문 한도를 다 썼어요', code: 'DAILY_LIMIT' }));
  await assert.rejects(a.api('/v1/x'), e => e.message === '오늘 질문 한도를 다 썼어요' && e.status === 429 && !e.friendly);
});
test('네트워크 오류·시간 초과는 연결 문제로 구분', async () => {
  const net = load(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(net.api('/v1/x'), e => e.status === 0 && e.code === 'NETWORK' && e.friendly && /인터넷 연결/.test(e.message));
  const slow = load(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); });
  await assert.rejects(slow.api('/v1/x'), e => e.code === 'TIMEOUT' && /늦어지고/.test(e.message));
});
test('health 실패도 친절한 문구 여부를 알려 줌', async () => {
  const a = load(res(503, { error: 'db', code: 'DB_UNAVAILABLE' }));
  const h = await a.health();
  assert.equal(h.friendly, true); assert.match(h.error, /저장소/);
});
