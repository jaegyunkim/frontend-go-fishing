import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict'; import test from 'node:test';
import { visitsHtml, lineChart, barChart, niceScale, changeText, num, pct } from '../admin-visits.js';

// visit.js: auth.js 를 빼고 실행(가짜 api·document)
function loadVisit(api, { pathname = '/frontend-go-fishing/', prerendering = false } = {}) {
  const code = fs.readFileSync(new URL('../visit.js', import.meta.url), 'utf8').replace(/^import .*;\n/m, '').replace(/^export /gm, '');
  const listeners = {}; const ctx = { api, location: { pathname }, document: { prerendering, addEventListener: (k, fn) => { listeners[k] = fn; } }, JSON, Promise, String };
  vm.runInNewContext(code + '\n;globalThis.__x={pageOf,countVisit};', ctx); return { ...ctx.__x, listeners };
}
test('방문 알림: 화면 구분·한 번 전송·실패해도 조용히', async () => {
  const calls = []; const ok = async (p, o) => { calls.push([p, JSON.parse(o.body).page, o.method]); return { ok: true }; };
  const v = loadVisit(ok, { pathname: '/frontend-go-fishing/register.html' });
  assert.deepEqual(calls, [['/v1/visits', 'register', 'POST']]);
  assert.equal(v.pageOf('/frontend-go-fishing/'), 'main'); assert.equal(v.pageOf('/index.html'), 'main'); assert.equal(v.pageOf('/register'), 'register');
  assert.equal(await v.countVisit('main', async () => { throw new Error('네트워크 오류'); }), false);
  assert.equal(await v.countVisit('main', () => { throw new Error('백엔드 주소 없음'); }), false);
  // 미리 렌더링 중이면 보일 때까지 기다림
  const later = []; const p = loadVisit(async (_p, o) => { later.push(JSON.parse(o.body).page); }, { prerendering: true });
  assert.equal(later.length, 0); p.listeners.prerenderingchange(); assert.deepEqual(later, ['main']);
});
test('숫자·증감 표기: 천 단위 쉼표, 비교 불가 안내', () => {
  assert.equal(num(1234567), '1,234,567'); assert.equal(num(12.34), '12.3'); assert.equal(num(null), '-');
  assert.equal(pct(0.125), '12.5%'); assert.match(changeText(0.2), /▲ 20%/); assert.match(changeText(-0.05), /▼ 5%/); assert.match(changeText(null), /아직 없어요/); assert.match(changeText(0), /변화 없어요/);
  assert.deepEqual(niceScale(0), { top: 1, ticks: [0, 1] }); assert.deepEqual(niceScale(7).top, 8); assert.ok(niceScale(1234).ticks.length <= 6);
});
const day = (d, main, register, covered = true, ma7Main = null) => ({ day: d, covered, main, register, ma7Main });
test('차트: 집계 전 날짜는 선을 끊고, 집계 없는 막대는 그리지 않음', () => {
  const svg = lineChart([day('2026-11-17', 0, 0, false), day('2026-11-18', 3, 1), day('2026-11-19', 1234, 2, true, 5.5)], 360);
  assert.match(svg, /<svg[^>]+viewBox="0 0 360 200"/); assert.match(svg, /11\.17\(화\) · 집계 전이에요/); assert.match(svg, /메인 1,234명 · 신청 2명 · 메인 7일 평균 5\.5명/);
  const lines = [...svg.matchAll(/<path d="([^"]*)" fill="none" stroke="#(2a78d6|eb6834)" stroke-width="2"/g)].map(m => m[1]);
  assert.equal(lines.length, 2); for (const d of lines) assert.equal((d.match(/M/g) ?? []).length, 1); // 첫날(집계 전)은 건너뜀
  const bars = barChart([{ label: '9월', values: [null, null], tip: '9월 · 집계 전이에요' }, { label: '10월', values: [10, 0], tip: 't' }], 360);
  assert.equal((bars.match(/<path d="M/g) ?? []).length, 1); assert.match(bars, /class="vz-ax dim">9월/);
});
test('화면 HTML: 탭 제목·핵심 수치·시즌 표·개인정보 없음', () => {
  const daily = Array.from({ length: 30 }, (_, i) => day(new Date(Date.UTC(2026, 9, 21 + i)).toISOString().slice(0, 10), 10 + i, 2, i >= 25));
  const v = { today: '2026-11-19', firstDay: '2026-11-15', policy: { rawDays: 30, dailyYears: 5 },
    kpi: { today: { main: 1200, register: 3, internal: 1 }, last7: { start: '2026-11-12', end: '2026-11-18', main: 40, register: 4, changeMain: null, changeRegister: null }, month: { main: 50, register: 5, changeMain: 0.1, changeRegister: null }, funnel30: { main: 50, both: 5, rate: 0.1, register: 6, directRegister: 1 }, last30: { internal: 2, hitsMain: 80, hitsRegister: 9 } },
    daily, monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, main: i === 10 ? 50 : 0, register: i === 10 ? 5 : 0, days: i === 10 ? 5 : 0, monthDays: 30, partial: true, avgMain: i === 10 ? 10 : null, avgRegister: i === 10 ? 1 : null })),
    seasons: [{ key: 'recent3', label: '최근 3개월', start: '2026-08-20', end: '2026-11-19', ongoing: true, days: 5, totalDays: 92, main: 50, register: 5, avgMain: 10, avgRegister: 1, prev: { days: 0 }, changeMain: null, changeRegister: null },
      { key: 'winter', label: '2025~26 겨울', months: '12~2월', start: '2025-12-01', end: '2026-02-28', ongoing: false, days: 0, totalDays: 90, main: 0, register: 0, avgMain: null, avgRegister: null, prev: { days: 0 } }],
    weekday: { rows: Array.from({ length: 7 }, (_, i) => ({ weekday: i, days: i < 4 ? 1 : 0, avgMain: i < 4 ? 10 : null, avgRegister: i < 4 ? 1 : null })) } };
  const h = visitsHtml(v, 30, 360);
  assert.match(h, /<h2>접속현황<\/h2>/); assert.match(h, /메인 <b>1,200<\/b>명/); assert.match(h, /관리자·내부 테스터 1명은 빼고 셌어요/);
  assert.match(h, /2025~26 겨울\(12~2월\)/); assert.match(h, /집계 전이에요/); assert.match(h, /1년 전 데이터가 아직 없어요/); assert.match(h, /▲ 10%/);
  assert.match(h, /data-vdays="30" class="on" aria-pressed="true"/); assert.match(h, /2026\.11\.15부터 집계했어요/);
  assert.doesNotMatch(h, /ip_hash|undefined|NaN/);
  // 맞춤법: 받침 없는 말 + 이에요 / 받침 있는 말 + 예요 가 없는지
  for (const m of h.matchAll(/([가-힣])예요/g)) assert.equal((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]);
  for (const m of h.matchAll(/([가-힣])이에요/g)) assert.notEqual((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]);
});
