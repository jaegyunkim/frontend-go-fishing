import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../telemetry.js', import.meta.url), 'utf8');
function setup(userAgent) {
  const calls = [], events = {};
  const window = { GOFISHING_API: 'https://api.test', addEventListener: (t, fn) => { events[t] = fn; } };
  const ctx = vm.createContext({ window, location: { search: '', hostname: 'f.test', pathname: '/index.html' }, localStorage: { getItem: () => null },
    navigator: userAgent === undefined ? undefined : { userAgent }, URL, URLSearchParams, Map, Promise, Object, Error, AbortController, Date, setTimeout, clearTimeout,
    fetch: (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true }); } });
  vm.runInContext(source, ctx);
  return { calls, events, t: window.GOFISHING_TELEMETRY };
}
const BOTS = [
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0)',
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Yeti/1.1; +https://naver.me/spd)',
  'GoogleOther', 'AdsBot-Google', 'Mediapartners-Google', 'Storebot-Google', 'NaverBot', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Mozilla/5.0 (compatible; Daumoa/4.0)',
  'DuckDuckBot/1.1', 'Baiduspider/2.0', 'YandexBot/3.0', 'PerplexityBot/1.0', 'GPTBot/1.0', 'ClaudeBot/1.0', 'anthropic-ai', 'Applebot/0.1',
  'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'Twitterbot/1.0', 'MyCrawler/1.0', 'some-spider', 'Foo Bot 2.0', 'SomeBOT/1.0'
];
const HUMANS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.0.0)',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.0',
  // 개발 시험용 브라우저는 로봇으로 보지 않는다
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11) Chrome-Lighthouse', 'Mozilla/5.0 Chrome/124 Lighthouse', 'Robotics Tablet Abbott', ''
];
test('로봇 UA는 true', () => { const { t } = setup(''); for (const ua of BOTS) assert.equal(t.isCrawler(ua), true, ua); });
test('일반 사람 UA(모바일·데스크톱·시험용 브라우저)는 false', () => { const { t } = setup(''); for (const ua of HUMANS) assert.equal(t.isCrawler(ua), false, ua); assert.equal(t.isCrawler(undefined), false); assert.equal(t.isCrawler(null), false); });
test('로봇이면 오류 보고(error·unhandledrejection·직접 호출) 모두 fetch 안 함', () => {
  for (const ua of BOTS.slice(0, 3)) {
    const x = setup(ua);
    x.events.error({ message: 'Script/resource load failed' });
    x.events.unhandledrejection({ reason: new Error('x') });
    x.t.report('error', 'boom');
    assert.equal(x.calls.length, 0);
    assert.equal(x.t.isCurrentCrawler(), true);
  }
});
test('사람이면 기존대로 오류 보고를 보냄', () => {
  for (const ua of [HUMANS[0], HUMANS[2], HUMANS[7], undefined]) {
    const x = setup(ua);
    x.events.error({ message: 'Script/resource load failed' });
    assert.equal(x.calls.length, 1);
    assert.equal(x.calls[0].url, 'https://api.test/v1/client-errors');
  }
});
test('방문 기록(visit.js)은 로봇이면 보내지 않고 사람이면 보냄', () => {
  const code = fs.readFileSync(new URL('../visit.js', import.meta.url), 'utf8').replace(/^import .*;\n/m, '').replace(/^export /gm, '');
  const run = isCurrent => { const calls = []; vm.runInNewContext(code, { api: async p => { calls.push(p); }, location: { pathname: '/' }, document: { prerendering: false, addEventListener() {} },
    JSON, Promise, String, GOFISHING_TELEMETRY: { isCurrentCrawler: () => isCurrent } }); return calls; };
  assert.deepEqual(run(true), []);
  assert.deepEqual(run(false), ['/v1/visits']);
});
