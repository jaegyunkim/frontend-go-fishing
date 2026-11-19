import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict'; import test from 'node:test';
import { visitsHtml, lineChart, barChart, niceScale, changeText, num, pct, avgChange, labelEvery, md, dot, SECTIONS } from '../admin-visits.js';

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
let base;
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
  base = v;
  assert.match(h, /<h2>접속현황<\/h2>/); assert.match(h, /메인 <b>1,200<\/b>명/); assert.match(h, /관리자·내부 테스터 1명은 빼고 셌어요/);
  assert.match(h, /2025~26 겨울\(12~2월\)/); assert.match(h, /집계 전이에요/); assert.match(h, /1년 전 데이터가 아직 없어요/); assert.match(h, /▲ 10%/);
  assert.match(h, /data-vdays="30" class="on" aria-pressed="true"/); assert.match(h, /2026\.11\.15부터 집계했어요/);
  assert.doesNotMatch(h, /ip_hash|undefined|NaN/);
  // 맞춤법: 받침 없는 말 + 이에요 / 받침 있는 말 + 예요 가 없는지
  for (const m of h.matchAll(/([가-힣])예요/g)) assert.equal((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]);
  for (const m of h.matchAll(/([가-힣])이에요/g)) assert.notEqual((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]);
});

// v1.18.1: 시간별·요일별·주간별·연간 + 섹션 탭
const full = () => ({ ...base, today: '2026-11-19',
  hourly: { days: 30, start: '2026-10-20', end: '2026-11-18', coveredDays: 4, nowHour: 14,
    today: Array.from({ length: 24 }, (_, h) => ({ hour: h, main: h === 9 ? 3 : h === 14 ? 1 : 0, register: h === 10 ? 1 : 0 })),
    avg: Array.from({ length: 24 }, (_, h) => ({ hour: h, main: h === 9 ? 2.5 : 0, register: h === 20 ? 0.5 : 0 })),
    peak: { main: { hour: 9, avg: 2.5 }, register: { hour: 20, avg: 0.5 } } },
  weekday: { ...base.weekday, weeks: 12, start: '2026-08-27', end: '2026-11-18' },
  weekly: [
    { week: '2026-W46', isoYear: 2026, isoWeek: 46, start: '2026-11-09', end: '2026-11-15', fullEnd: '2026-11-15', ongoing: false, days: 1, main: 10, register: 1, avgMain: 10, avgRegister: 1, prevDays: 0, changeMain: null, changeRegister: null },
    { week: '2026-W47', isoYear: 2026, isoWeek: 47, start: '2026-11-16', end: '2026-11-19', fullEnd: '2026-11-22', ongoing: true, days: 4, main: 48, register: 2, avgMain: 12, avgRegister: 0.5, prevDays: 1, changeMain: 0.2, changeRegister: -0.5 }],
  yearly: [
    { year: 2025, start: '2025-01-01', end: '2025-12-31', ongoing: false, days: 0, yearDays: 365, main: 0, register: 0, avgMain: null, avgRegister: null, prev: { days: 0 }, changeMain: null, changeRegister: null },
    { year: 2026, start: '2026-01-01', end: '2026-11-19', ongoing: true, days: 5, yearDays: 365, main: 58, register: 3, avgMain: 11.6, avgRegister: 0.6, prev: { days: 0 }, changeMain: null, changeRegister: null }] });
const spell = h => { for (const m of h.matchAll(/([가-힣])예요/g)) assert.equal((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]); for (const m of h.matchAll(/([가-힣])이에요/g)) assert.notEqual((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]); };
const pane = (h, s) => h.match(new RegExp(`<section[^>]*data-vsec-pane="${s}"[^>]*>[\\s\\S]*?</section>`))[0];
test('섹션 탭: 짧은 단위→긴 단위 순서, 고른 섹션만 보이고 나머지는 숨김', () => {
  assert.deepEqual(SECTIONS.map(s => s[1]), ['시간별', '일간', '요일별', '주간별', '월간', '시즌별', '연간', '기기·지역']);
  const h = visitsHtml(full(), 30, 360, { sec: 'weekly' });
  const order = [...h.matchAll(/data-vsec-pane="(\w+)"/g)].map(m => m[1]); assert.deepEqual(order, SECTIONS.map(s => s[0]));
  assert.match(h, /data-vsec="weekly" aria-controls="vz-weekly" aria-selected="true" class="on"/);
  for (const [s] of SECTIONS) assert.equal(/<section[^>]*hidden>/.test(pane(h, s).slice(0, 300)), s !== 'weekly', s);
  assert.match(visitsHtml(full(), 30, 360, { sec: '없는섹션' }), /data-vsec="daily"[^>]*aria-selected="true"/); // 기본은 일간
  assert.doesNotMatch(h, /undefined|NaN/); spell(h);
});
test('시간별: 오늘 지난 시간만 평소와 비교, 앞으로의 시간은 0이 아니라 "아직이에요"', () => {
  const h = pane(visitsHtml(full(), 30, 360, { sec: 'hourly' }), 'hourly');
  assert.match(h, /어제까지 최근 30일 중 집계 4일 · 오늘 14시 기준/);
  assert.match(h, /메인 <b>4<\/b>명/); // 오늘 지금까지 = 3 + 1
  assert.match(h, /평소 0~14시 전보다 메인 <span class="vz-chg">▲ 20%<\/span>/); // 오늘 0~13시 3명 vs 평균 2.5명
  assert.match(h, /메인 <b>9시\(하루 평균 2\.5명\)<\/b>/);
  assert.match(h, /15시대 · 아직이에요/); assert.match(h, /오늘 14시대\(진행 중\)/);
  assert.match(h, /<td>23시<\/td><td class="num">.*?<\/td><td class="num"><span class="sub">아직이에요<\/span>/);
  assert.match(h, /data-vmode="avg" aria-pressed="true"/); assert.match(h, /data-vpane="today" hidden/);
  // 어제까지 집계된 날이 없으면 오늘 보기로 시작
  const f = full(); f.hourly = { ...f.hourly, coveredDays: 0, peak: null, avg: f.hourly.avg.map(x => ({ hour: x.hour, main: null, register: null })) };
  const z = pane(visitsHtml(f, 30, 360, { sec: 'hourly' }), 'hourly');
  assert.match(z, /data-vmode="today" aria-pressed="true"/); assert.match(z, /어제까지 집계된 날이 아직 없어요/); assert.match(z, /비교 전/);
  // 고른 보기 유지
  assert.match(pane(visitsHtml(full(), 30, 360, { sec: 'hourly', modes: { hourly: 'today' } }), 'hourly'), /data-vpane="avg" hidden/);
});
test('주간·연간: 진행 중 표시·옅은 막대·전주 대비(하루 평균), 수집 전 해는 집계 전', () => {
  const h = visitsHtml(full(), 30, 360);
  const w = pane(h, 'weekly');
  assert.match(w, /2026년 47주\(11\.16~11\.22\)/); assert.match(w, /<span class="pill">진행 중<\/span> <span class="sub">집계 4\/4일|<span class="pill">진행 중<\/span> <span class="sub">4일/);
  assert.match(w, /전주보다 메인 <span class="vz-chg">▲ 20%<\/span> · 신청 <span class="vz-chg">▼ 50%<\/span>/);
  assert.match(w, /fill-opacity="\.45"/); assert.match(w, /2026\.11\.16~2026\.11\.19/); assert.match(w, /진행 중, 집계 4\/4일/);
  const y = pane(h, 'yearly');
  assert.match(y, /2025년 · 집계 전이에요/); assert.match(y, /전년 같은 기간 데이터가 아직 없어요/); assert.match(y, /올해 하루 평균/);
  // 월간: 하루 평균 기준 전월 대비(직전 달 집계가 없으면 비교 전)
  assert.match(pane(h, 'monthly'), /전월 데이터가 아직 없어요/);
  assert.equal(avgChange(30, 3, 20, 4), 1); assert.equal(avgChange(5, 0, 5, 5), null); assert.equal(avgChange(5, 5, 0, 5), null);
});
test('요일별: 주중·주말 하루 평균(집계 일수 가중), 일간: 오늘은 진행 중·수집 전 구간 표시', () => {
  const f = full(); f.weekday = { ...f.weekday, rows: [0, 1, 2, 3, 4, 5, 6].map(i => ({ weekday: i, days: 2, avgMain: i === 0 || i === 6 ? 20 : 10, avgRegister: 1 })) };
  const wd = pane(visitsHtml(f, 30, 360, { sec: 'weekday' }), 'weekday');
  assert.match(wd, /주중\(월~금\) 하루 평균.*?메인 <b>10<\/b>명/); assert.match(wd, /주말\(토·일\) 하루 평균.*?주중보다 메인 <span class="vz-chg">▲ 100%/);
  assert.match(wd, /2026\.08\.27~2026\.11\.18 · 최근 12주/);
  const d = pane(visitsHtml(f, 30, 360), 'daily');
  assert.match(d, /11\.19\(목\)\(오늘, 진행 중\)/); assert.match(d, /11\.19\(목\) <span class="pill">진행 중<\/span>/); assert.match(d, /class="vz-pre"/); assert.match(d, /<span class="sub">집계 전<\/span>/);
  assert.match(d, /circle[^>]+fill="#fff" stroke="#2a78d6"/); // 오늘 점은 속이 빔
});
test('예전 백엔드(시간별·주간·연간 없음)도 화면이 깨지지 않음', () => {
  const h = visitsHtml(base, 30, 360, { sec: 'hourly' });
  assert.equal((h.match(/백엔드를 v1\.3\.47 이상으로 올리면 보여요/g) ?? []).length, 3); assert.doesNotMatch(h, /undefined|NaN/);
});
test('날짜·이름표 간격', () => {
  assert.equal(md('2026-01-05'), '01.05'); assert.equal(dot('2026-01-05'), '2026.01.05');
  assert.equal(labelEvery(['11.16', '11.23'], 26), 2); assert.equal(labelEvery(['9월'], 26), 1); assert.equal(labelEvery(['0시'], 10, 3), 3);
  const svg = barChart(Array.from({ length: 24 }, (_, i) => ({ label: `${i}시`, values: [1, 0], tip: 't' })), 360, 180, { every: 3, anchor: 'start' });
  assert.deepEqual([...svg.matchAll(/class="vz-ax">(\d+)시</g)].map(m => +m[1]), [0, 3, 6, 9, 12, 15, 18, 21]);
  assert.doesNotMatch(barChart([{ label: '1시', values: [null, null], future: true, tip: 't' }], 360), />-<\/text>/);
});

test('기기·지역: 항목별 묶기(메인·신청 합산, 알 수 없음은 맨 뒤), 지역 미연결 안내', async () => {
  const { groupSegments, visitsHtml: vh } = await import('../admin-visits.js');
  const rows = [{ page: 'main', platform: '아이폰', visitors: 3 }, { page: 'register', platform: '아이폰', visitors: 1 }, { page: 'main', platform: '알 수 없음', visitors: 9 }, { page: 'main', platform: '안드로이드', visitors: 2 }];
  assert.deepEqual(groupSegments(rows, 'platform').map(g => [g.key, g.main, g.register, g.total]), [['아이폰', 3, 1, 4], ['안드로이드', 2, 0, 2], ['알 수 없음', 9, 0, 9]]);
  const v = full(); v.segments = { days: 7, from: '2026-11-13', to: '2026-11-19', rows: [{ page: 'main', platform: '아이폰', os_family: 'iOS', browser: 'Chrome', region: '알 수 없음', visitors: 2 }] };
  const h = vh(v, 7, 360, { sec: 'devices' });
  assert.match(h, /외부 방문자 2명/); assert.match(h, /아이폰/); assert.match(h, /지역\(시·도\)/);
  v.segments.rows.push({ page: 'register', platform: '안드로이드', os_family: 'Android', browser: '삼성 인터넷', region: '부산', visitors: 1 });
  assert.match(vh(v, 7, 360, { sec: 'devices' }), /부산[\s\S]*DB-IP/);
});
