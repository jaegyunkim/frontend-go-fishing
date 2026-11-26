import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../telemetry.js', import.meta.url), 'utf8');
const authSource = fs.readFileSync(new URL('../auth.js', import.meta.url), 'utf8').replace(/export /g, '');
function setup(options = {}) {
  const events = {}, calls = [], timers = new Map();
  let now = 100000, seq = 0;
  const location = { search: '', hostname: 'frontend.test', pathname: '/frontend-go-fishing/index.html', protocol: 'https:', ...options.location };
  const stored = new Map(Object.entries(options.storage || {}));
  const storage = { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k) };
  const window = { GOFISHING_API: 'https://api.test', GOFISHING_API_FALLBACKS: options.fallbacks || [], addEventListener: (type, fn) => { events[type] = fn; } };
  const ctx = vm.createContext({ window, location, localStorage: options.blockStorage ? { getItem() { throw Error('blocked'); } } : storage, sessionStorage: storage,
    URL, URLSearchParams, Map, Promise, Object, Error, AbortController, AbortSignal,
    Date: { now: () => now }, setTimeout: fn => { timers.set(++seq, fn); return seq; }, clearTimeout: id => timers.delete(id),
    fetch: (url, opts) => { calls.push({ url, opts }); return options.fetch ? options.fetch(url, opts) : Promise.resolve({ ok: true, status: 200 }); }
  });
  vm.runInContext(source, ctx);
  return { ctx, calls, events, window, timers, tick: ms => { now += ms; }, reporter: window.GOFISHING_TELEMETRY,
    auth() { vm.runInContext(authSource, ctx); return vm.runInContext('({ api, state, setApi, health })', ctx); } };
}
const body = call => JSON.parse(call.opts.body);
const flush = () => new Promise(resolve => setImmediate(resolve));

test('classic 오류/거부 수집과 최소 payload, 무인증 전송', async () => {
  const x = setup();
  x.events.error({ message: 'ReferenceError: missing value', error: { stack: 'ReferenceError: private\n at run (https://frontend.test/app.js?v=1:42:3)' } });
  x.events.unhandledrejection({ reason: new Error('Rejected operation') });
  assert.equal(x.calls.length, 2);
  assert.deepEqual(Object.keys(body(x.calls[0])), ['kind', 'message', 'stack', 'page']);
  assert.equal(body(x.calls[0]).stack, 'app.js:42:3');
  assert.equal(x.calls[0].url, 'https://api.test/v1/client-errors');
  assert.equal(x.calls[0].opts.credentials, 'omit');
  assert.equal(x.calls[0].opts.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(x.calls[0].opts.headers), ['Content-Type']);
  await flush(); assert.equal(x.timers.size, 0);
});
test('비밀번호/토큰/URL/query/hash/이메일/인용문 및 stack 임의 경로 제거', () => {
  const x = setup({ location: { search: '?token=querysecret', pathname: '/private-user/address.html', hash: '#hashsecret' } });
  x.reporter.report('error', 'failure https://user:pass@host/private?x=urlsecret#hashsecret /route?x=relsecret#frag user@example.com "quotedsecret"\npassword: passsecret\ntoken is tokensecret\nBearer bearersecret', 'Error: stacksecret\n at privateuser (/home/private/address.js:1:2)');
  const payload = x.calls[0].opts.body;
  for (const secret of ['querysecret', 'hashsecret', 'urlsecret', 'relsecret', 'user@example', 'quotedsecret', 'passsecret', 'tokensecret', 'bearersecret', 'stacksecret', 'privateuser', '/home/private']) assert.ok(!payload.includes(secret), secret);
  assert.equal(body(x.calls[0]).page, '[page]');
});
test('길이 상한 및 임의 객체/throwing getter를 안전하게 처리', () => {
  const x = setup();
  x.reporter.report('a '.repeat(100), 'm '.repeat(2000), 'app.js:1:2\n'.repeat(500));
  const p = body(x.calls[0]);
  assert.ok(p.kind.length <= 40 && p.message.length <= 1000 && p.stack.length <= 2000 && p.page.length <= 200);
  x.events.unhandledrejection({ reason: { password: 'never-serialize-me' } });
  assert.ok(!JSON.stringify(x.calls).includes('never-serialize-me'));
  assert.doesNotThrow(() => x.events.unhandledrejection({ get reason() { throw Error('bad getter'); } }));
});
test('중복 60초, 분당 5건, 페이지당 30건으로 실패 시도까지 제한', () => {
  const x = setup();
  for (let i = 0; i < 10; i++) x.reporter.report('error', 'same');
  assert.equal(x.calls.length, 1);
  for (let i = 0; i < 10; i++) x.reporter.report('error', `different ${i}`);
  assert.equal(x.calls.length, 5);
  for (let minute = 0; minute < 10; minute++) { x.tick(60000); for (let i = 0; i < 5; i++) x.reporter.report('error', `failure ${i}`); }
  assert.equal(x.calls.length, 30);
});
test('전송 reject/동기 throw/5xx는 재귀·재시도 없고 timeout 정리', async () => {
  for (const fetch of [() => Promise.reject(Error('offline')), () => { throw Error('sync'); }, () => Promise.resolve({ status: 500 })]) {
    const x = setup({ fetch });
    assert.doesNotThrow(() => x.reporter.report('error', 'failure'));
    await flush(); assert.equal(x.calls.length, 1); assert.equal(x.timers.size, 0);
  }
  const x = setup({ fetch: () => new Promise(() => {}) });
  x.reporter.report('error', 'failure');
  [...x.timers.values()][0](); assert.equal(x.calls[0].opts.signal.aborted, true);
});
test('초기 API 우선순위, 저장소 차단, 실제 API base 변경 및 위험 URL 거절', () => {
  for (const [options, target] of [
    [{ location: { search: '?api=https%3A%2F%2Fquery.test' }, storage: { 'gofishing.api': 'https://stored.test' } }, 'https://query.test'],
    [{ storage: { 'gofishing.api': 'https://stored.test' } }, 'https://stored.test'],
    [{ blockStorage: true }, 'https://api.test']
  ]) { const x = setup(options); x.reporter.report('error', 'initial'); assert.equal(x.calls[0].url, target + '/v1/client-errors'); }
  const x = setup(); x.reporter.report('error', 'actual', '', 'https://actual.test/base/');
  assert.equal(x.calls[0].url, 'https://actual.test/base/v1/client-errors');
  for (const bad of ['javascript:alert(1)', 'https://user:secret@host', 'https://host?token=secret', 'https://host/#secret']) { x.reporter.setApiBase(bad); x.reporter.report('error', bad); }
  assert.equal(x.calls.length, 1);
});
test('auth.api network/5xx/json 오류 수집, 본문 비수집, 기존 반환/예외 유지', async () => {
  for (const scenario of ['network', '5xx', 'json', '401', 'ok']) {
    const x = setup({ fetch: (url) => {
      if (url.endsWith('/v1/client-errors')) return Promise.reject(Error('telemetry offline'));
      if (scenario === 'network') return Promise.reject(Error('password: requestsecret'));
      return Promise.resolve({ ok: ['json', 'ok'].includes(scenario), status: scenario === '5xx' ? 503 : scenario === '401' ? 401 : 200,
        json: async () => { if (scenario === 'json') throw Error('token: responsesecret'); return { error: 'serversecret', ok: true }; } });
    } });
    const a = x.auth(); a.state.api = 'https://actual.test'; a.state.auth = { token: 'sessionsecret' };
    if (['network', '5xx', '401'].includes(scenario)) await assert.rejects(a.api('/private?secret=urlsecret', { body: 'password=bodysecret' }));
    else { const result = await a.api('/private?secret=urlsecret'); assert.equal(scenario === 'json' ? Object.keys(result).length : result.ok, scenario === 'json' ? 0 : true); }
    const reports = x.calls.filter(c => c.url.endsWith('/v1/client-errors'));
    assert.equal(reports.length, ['401', 'ok'].includes(scenario) ? 0 : 1);
    if (reports.length) { assert.equal(body(reports[0]).kind, { network: 'api_network', '5xx': 'api_5xx', json: 'api_json' }[scenario]); assert.equal(reports[0].url, 'https://actual.test/v1/client-errors'); for (const secret of ['sessionsecret', 'requestsecret', 'responsesecret', 'serversecret', 'urlsecret', 'bodysecret']) assert.ok(!reports[0].opts.body.includes(secret)); }
    await flush();
  }
});
test('reporter 누락/고장에도 API 정상, setApi/fallback 실제 주소 반영', async () => {
  const x = setup({ fallbacks: ['https://backup.test'], fetch: async url => {
    if (url.endsWith('/v1/client-errors')) return { ok: true };
    if (url.startsWith('https://api.test')) throw Error('offline');
    return { ok: true, status: 200, json: async () => ({ auth: { mode: 'off' } }) };
  } });
  const a = x.auth(); await a.health(); assert.equal(a.state.api, 'https://backup.test');
  x.events.error({ message: 'After fallback' }); assert.equal(x.calls.at(-1).url, 'https://backup.test/v1/client-errors');
  a.setApi('https://new.test'); x.events.error({ message: 'After settings' }); assert.equal(x.calls.at(-1).url, 'https://new.test/v1/client-errors');
  x.window.GOFISHING_TELEMETRY = { report() { throw Error('broken'); }, setApiBase() { throw Error('broken'); } };
  assert.equal((await a.api('/ok')).auth.mode, 'off');
  x.window.GOFISHING_TELEMETRY = undefined; assert.equal((await a.api('/ok')).auth.mode, 'off');
});
test('모든 HTML은 config 뒤 module 앞 classic telemetry 포함', () => {
  const root = new URL('../', import.meta.url);
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(new URL(file, root), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]).filter(s => !s.includes("ld+json"));
    if (!scripts.length) continue; // 스크립트 없는 정적 소개 페이지(about.html)는 제외
    const config = scripts.findIndex(s => s.includes('config.js'));
    const telemetry = scripts.findIndex(s => s.includes('telemetry.js'));
    const module = scripts.findIndex(s => s.includes('type="module"'));
    assert.ok(config >= 0 && telemetry > config && module > telemetry, file);
    assert.ok(!/type=|defer|async/.test(scripts[telemetry]), file);
    assert.equal(scripts.filter(s => s.includes('telemetry.js')).length, 1);
  }
});
test('5xx JSON 파싱 동시 실패, timeout 수집 및 모든 fallback 실패 시 주소 복원', async () => {
  const x = setup({ fallbacks: ['https://backup.test'], fetch: async url => {
    if (url.endsWith('/v1/client-errors')) return { ok: true };
    if (url.endsWith('/timeout')) throw Object.assign(Error('timeout'), { name: 'TimeoutError' });
    return { ok: false, status: 502, json: async () => { throw Error('bad JSON'); } };
  } });
  const a = x.auth(); await assert.rejects(a.api('/broken'), { status: 502 });
  assert.deepEqual(x.calls.filter(c => c.url.endsWith('/v1/client-errors')).map(c => body(c).kind), ['api_5xx', 'api_json']);
  await assert.rejects(a.api('/timeout'), { status: 0 });
  assert.equal(body(x.calls.at(-1)).message, 'API request timed out');
  await a.health(); assert.equal(a.state.api, 'https://api.test');
  x.tick(60000); x.events.error({ message: 'Restored primary' });
  assert.equal(x.calls.at(-1).url, 'https://api.test/v1/client-errors');
  await flush();
});
test('이전 요청의 실제 주소는 이후 전역 오류 목적지를 덮어쓰지 않음', () => {
  const x = setup(); x.reporter.setApiBase('https://backup.test');
  x.reporter.report('api_network', 'Old request failed', '', 'https://old.test');
  x.events.error({ message: 'Current page error' });
  assert.equal(x.calls[0].url, 'https://old.test/v1/client-errors');
  assert.equal(x.calls[1].url, 'https://backup.test/v1/client-errors');
});
