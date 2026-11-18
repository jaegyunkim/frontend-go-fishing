// 관리자 '접속현황' 화면: 메인(로그인)·이용 신청 페이지 방문자 지표와 인라인 SVG 차트(외부 라이브러리 없음).
// 순수 함수만 둔다(DOM·API 없음) → node 테스트에서 그대로 검사한다.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = v => v == null ? '-' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
export const pct = v => v == null ? '-' : (Math.round(v * 1000) / 10).toLocaleString('ko-KR') + '%';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const md = d => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const dayLabel = d => `${md(d)}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
const range = (a, b) => a === b ? dayLabel(a) : `${dayLabel(a)}~${dayLabel(b)}`;
const SERIES = [{ key: 'main', name: '메인(로그인)', color: '#2a78d6' }, { key: 'register', name: '이용 신청', color: '#eb6834' }];

/** 증감 표시: ▲ 12.5% / ▼ 3% / 같아요 / 비교 불가 문구 */
export function changeText(v, none = '비교할 데이터가 아직 없어요') {
  if (v == null) return `<span class="vz-chg none">${esc(none)}</span>`;
  if (v === 0) return '<span class="vz-chg">변화 없어요</span>';
  return `<span class="vz-chg">${v > 0 ? '▲' : '▼'} ${pct(Math.abs(v))}</span>`;
}
/** 축 눈금: 정수 단위의 보기 좋은 간격(최대 5칸) */
export function niceScale(max) {
  const v = Math.max(1, max), raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) ?? 10 * p; step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(v / step) * step, ticks = []; for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}
/** 세로축 눈금 글자 폭에 맞춘 왼쪽 여백 */
const axisW = top => Math.round(12 + 6.2 * num(top).length);
const legend = () => `<div class="vz-legend">${SERIES.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
const readout = hint => `<p class="vz-read" aria-live="polite">${esc(hint)}</p>`;
const barPath = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };

/** 일간 꺾은선: 메인·신청 방문자 + 메인 7일 이동평균(점선). 수집 전 날짜는 선을 그리지 않는다. */
export function lineChart(daily, width = 360, height = 200) {
  const vals = daily.flatMap(d => [d.main, d.register, d.ma7Main ?? 0]); const { top, ticks } = niceScale(Math.max(0, ...vals));
  const L = axisW(top), R = 8 + 6.5 * num(top).length, T = 12, B = 24, W = width, H = height, n = daily.length, pw = W - L - R, ph = H - T - B;
  const x = i => L + (n > 1 ? i * pw / (n - 1) : pw / 2), y = v => T + ph - v / top * ph;
  const path = get => { let s = '', pen = false; daily.forEach((d, i) => { const v = get(d); if (!d.covered || v == null) { pen = false; return; } s += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return s; };
  const grid = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="vz-grid"/><text x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end" class="vz-ax">${num(t)}</text>`).join('');
  const marks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" class="vz-ax">${md(daily[i].day)}</text>`).join('');
  const last = [...daily].reverse().find(d => d.covered), li = daily.lastIndexOf(last);
  const ends = last ? SERIES.map(s => ({ s, v: last[s.key] })).sort((a, b) => b.v - a.v).map((e, k, arr) => { let yy = y(e.v) + 4; if (k === 1 && Math.abs(yy - (y(arr[0].v) + 4)) < 12) yy = y(arr[0].v) + 16; return `<circle cx="${x(li)}" cy="${y(e.v)}" r="3.5" fill="${e.s.color}" stroke="#fff" stroke-width="2"/><text x="${x(li) + 7}" y="${yy}" class="vz-end">${num(e.v)}</text>`; }).join('') : '';
  const step = n > 1 ? pw / (n - 1) : pw;
  const hits = daily.map((d, i) => { const tip = d.covered ? `${dayLabel(d.day)} · 메인 ${num(d.main)}명 · 신청 ${num(d.register)}명${d.ma7Main != null ? ` · 메인 7일 평균 ${num(d.ma7Main)}명` : ''}` : `${dayLabel(d.day)} · 집계 전이에요`; return `<rect x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${ph}" class="vz-hit" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`; }).join('');
  return `<svg class="vz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="최근 ${n}일 하루 방문자 꺾은선 차트">${grid}${marks}
    <path d="${path(d => d.ma7Main)}" fill="none" stroke="#2a78d6" stroke-opacity=".45" stroke-width="2" stroke-dasharray="4 3"/>
    ${SERIES.map(s => `<path d="${path(d => d[s.key])}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}${ends}${hits}</svg>`;
}
/** 묶음 막대: groups=[{label, values:[메인, 신청](null=집계 없음), tip}] */
export function barChart(groups, width = 360, height = 190, { aria = '막대 차트' } = {}) {
  const { top, ticks } = niceScale(Math.max(0, ...groups.flatMap(g => g.values.map(v => v ?? 0))));
  const L = axisW(top), R = 6, T = 12, B = 24, W = width, H = height, pw = W - L - R, ph = H - T - B, n = groups.length, gw = pw / n;
  const y = v => T + ph - v / top * ph, k = SERIES.length, bw = Math.max(3, Math.min(18, (gw * 0.72 - 2 * (k - 1)) / k));
  const grid = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="vz-grid"/><text x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end" class="vz-ax">${num(t)}</text>`).join('');
  const every = gw >= 24 ? 1 : 2;
  const body = groups.map((g, i) => {
    const cx = L + gw * i + gw / 2, x0 = cx - (bw * k + 2 * (k - 1)) / 2;
    const bars = g.values.map((v, j) => v == null || v <= 0 ? '' : `<path d="${barPath(x0 + j * (bw + 2), y(v), bw, T + ph - y(v))}" fill="${SERIES[j].color}"/>`).join('');
    const none = g.values.every(v => v == null) ? `<text x="${cx}" y="${T + ph - 4}" text-anchor="middle" class="vz-ax">-</text>` : '';
    const lab = i % every === 0 || i === n - 1 ? `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="vz-ax${g.values.every(v => v == null) ? ' dim' : ''}">${esc(g.label)}</text>` : '';
    return `${bars}${none}${lab}<rect x="${(L + gw * i).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${ph}" class="vz-hit" data-tip="${esc(g.tip)}"><title>${esc(g.tip)}</title></rect>`;
  }).join('');
  return `<svg class="vz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">${grid}<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" class="vz-base"/>${body}</svg>`;
}
const pair = (a, b) => `<b>${num(a)}</b><span class="vz-sep">·</span><b>${num(b)}</b>`;
const kpi = (title, main, register, sub) => `<div class="vz-kpi"><span class="vz-kt">${title}</span><div class="vz-kv"><span><i style="background:#2a78d6"></i>메인 <b>${num(main)}</b>명</span><span><i style="background:#eb6834"></i>신청 <b>${num(register)}</b>명</span></div><div class="vz-ks">${sub}</div></div>`;

/** 화면 전체 HTML. v=GET /v1/admin/visits 의 visits, days=일간 기간, width=차트 폭(px) */
export function visitsHtml(v, days = 30, width = 360) {
  const k = v.kpi, cw = Math.round(Math.max(300, Math.min(900, width)));
  const started = v.firstDay ? `${v.firstDay.replaceAll('-', '.')}부터 집계했어요` : '아직 집계된 방문이 없어요';
  const head = `<div class="tool"><h2>접속현황</h2><div class="acts">${[14, 30, 90].map(d => `<button data-vdays="${d}" class="${d === days ? 'on' : ''}" aria-pressed="${d === days}">${d}일</button>`).join('')}<button id="vRefresh">새로 고침</button></div></div>
    <p class="sub">메인(로그인) 화면과 이용 신청 화면을 연 방문자 수예요. 같은 IP는 하루에 페이지마다 1명으로 세요. ${esc(started)}.</p>`;
  const cards = `<div class="vz-kpis">
    ${kpi('오늘', k.today.main, k.today.register, k.today.internal ? `관리자·내부 테스터 ${num(k.today.internal)}명은 빼고 셌어요` : '한국 시간 0시부터 지금까지예요')}
    ${kpi('최근 7일', k.last7.main, k.last7.register, `${esc(range(k.last7.start, k.last7.end))} · 직전 7일보다 메인 ${changeText(k.last7.changeMain, '비교 전')} · 신청 ${changeText(k.last7.changeRegister, '비교 전')}`)}
    ${kpi('이번 달', k.month.main, k.month.register, `지난달 같은 기간(1일~어제)보다 메인 ${changeText(k.month.changeMain, '비교 전')} · 신청 ${changeText(k.month.changeRegister, '비교 전')}`)}
    <div class="vz-kpi"><span class="vz-kt">신청 화면 이동률(30일)</span><div class="vz-kv"><b class="vz-big">${pct(k.funnel30.rate)}</b></div><div class="vz-ks">메인 방문자 ${num(k.funnel30.main)}명 중 같은 날 신청 화면도 연 분 ${num(k.funnel30.both)}명 · 신청 화면으로 바로 온 분 ${num(k.funnel30.directRegister)}명</div></div>
  </div>`;
  const dailyCard = `<div class="card vz-card"><h3>일간 방문자 <span class="sub">최근 ${days}일</span></h3>${legend()}<p class="sub vz-note">점선은 메인 화면 7일 이동평균이에요(7일이 모두 집계된 날부터).</p>
    <div class="vz-wrap">${lineChart(v.daily, cw)}</div>${readout('차트를 누르면 그날 수치를 보여 드려요.')}
    <details class="vz-more"><summary>표로 보기</summary><div class="scroll"><table class="tbl"><tr><th>날짜</th><th class="num">메인</th><th class="num">신청</th><th class="num">메인 7일 평균</th></tr>${[...v.daily].reverse().map(d => `<tr><td>${dayLabel(d.day)}</td><td class="num">${d.covered ? num(d.main) : '-'}</td><td class="num">${d.covered ? num(d.register) : '-'}</td><td class="num">${num(d.ma7Main)}</td></tr>`).join('')}</table></div></details></div>`;
  const ml = m => `${m.month.slice(0, 4)}년 ${Number(m.month.slice(5))}월`;
  const monthCard = `<div class="card vz-card"><h3>월간 방문자 <span class="sub">최근 12개월</span></h3>${legend()}
    <div class="vz-wrap">${barChart(v.monthly.map(m => ({ label: `${Number(m.month.slice(5))}월`, values: m.days ? [m.main, m.register] : [null, null], tip: m.days ? `${ml(m)} · 메인 ${num(m.main)}명 · 신청 ${num(m.register)}명 · 집계 ${m.days}/${m.monthDays}일` : `${ml(m)} · 집계 전이에요` })), cw, 190, { aria: '최근 12개월 월별 방문자 막대 차트' })}</div>${readout('막대를 누르면 그달 수치를 보여 드려요.')}
    <details class="vz-more"><summary>표로 보기</summary><div class="scroll"><table class="tbl"><tr><th>월</th><th class="num">메인</th><th class="num">신청</th><th class="num">하루 평균(메인·신청)</th><th class="num">집계 일수</th></tr>${[...v.monthly].reverse().map(m => `<tr><td>${ml(m)}${m.partial && m.days ? ' <span class="sub">(일부)</span>' : ''}</td><td class="num">${m.days ? num(m.main) : '-'}</td><td class="num">${m.days ? num(m.register) : '-'}</td><td class="num">${m.days ? pair(m.avgMain, m.avgRegister) : '-'}</td><td class="num">${m.days}/${m.monthDays}일</td></tr>`).join('')}</table></div></details></div>`;
  const sl = s => s.key === 'recent3' ? s.label : `${s.label}(${s.months})`;
  const seasonCard = `<div class="card vz-card"><h3>시즌별 방문자 <span class="sub">하루 평균</span></h3>${legend()}<p class="sub vz-note">시즌마다 길이와 집계 일수가 달라서 하루 평균으로 비교해요. 진행 중인 시즌은 오늘까지, 1년 전도 같은 기간끼리 비교해요.</p>
    <div class="vz-wrap">${barChart(v.seasons.map(s => ({ label: s.key === 'recent3' ? '최근3개월' : s.label.replace(/^\d{4}(~\d{2})? /, ''), values: s.days ? [s.avgMain, s.avgRegister] : [null, null], tip: s.days ? `${sl(s)} · 하루 평균 메인 ${num(s.avgMain)}명 · 신청 ${num(s.avgRegister)}명` : `${sl(s)} · 집계 전이에요` })), cw, 190, { aria: '시즌별 하루 평균 방문자 막대 차트' })}</div>${readout('막대를 누르면 시즌 수치를 보여 드려요.')}
    <div class="scroll"><table class="tbl"><tr><th>시즌</th><th>기간</th><th class="num">합계(메인·신청)</th><th class="num">하루 평균(메인·신청)</th><th>1년 전 같은 기간 대비</th></tr>${v.seasons.map(s => `<tr><td><b>${esc(sl(s))}</b>${s.ongoing && s.key !== 'recent3' ? ' <span class="pill">진행 중</span>' : ''}</td><td class="sub">${s.start.replaceAll('-', '.')}~${s.end.replaceAll('-', '.')}<br>집계 ${s.days}/${s.totalDays}일</td>
      <td class="num">${s.days ? pair(s.main, s.register) : '<span class="sub">집계 전이에요</span>'}</td><td class="num">${s.days ? pair(s.avgMain, s.avgRegister) : '-'}</td><td>${s.days && s.prev.days ? `메인 ${changeText(s.changeMain)} · 신청 ${changeText(s.changeRegister)}` : '<span class="sub">1년 전 데이터가 아직 없어요</span>'}</td></tr>`).join('')}</table></div></div>`;
  const order = [1, 2, 3, 4, 5, 6, 0], wk = v.weekday;
  const wdCard = `<div class="card vz-card"><h3>요일별 하루 평균 <span class="sub">최근 12주(어제까지)</span></h3>${legend()}
    <div class="vz-wrap">${barChart(order.map(i => wk.rows[i]).map(r => ({ label: WD[r.weekday], values: r.days ? [r.avgMain, r.avgRegister] : [null, null], tip: r.days ? `${WD[r.weekday]}요일 · 하루 평균 메인 ${num(r.avgMain)}명 · 신청 ${num(r.avgRegister)}명(${r.days}일 기준)` : `${WD[r.weekday]}요일 · 집계 전이에요` })), cw, 170, { aria: '요일별 하루 평균 방문자 막대 차트' })}</div>${readout('막대를 누르면 요일 수치를 보여 드려요.')}
    <p class="sub vz-note">${wk.rows.some(r => r.days) ? `요일마다 집계된 날이 ${Math.min(...wk.rows.map(r => r.days))}~${Math.max(...wk.rows.map(r => r.days))}일이에요. 4주 이상 쌓이면 패턴을 믿을 만해요.` : '어제까지 집계된 날이 아직 없어요.'}</p></div>`;
  const foot = `<div class="card"><h3>집계 기준</h3><ul class="sk-ul">
    <li>방문자는 하루(한국 시간 0시~24시) 동안 같은 IP에서 같은 화면을 여러 번 열어도 1명으로 세요. 같은 와이파이·통신사 IP를 함께 쓰는 여러 분은 1명으로 셀 수 있어요.</li>
    <li>관리자·내부 테스터 접속과 검색 로봇 같은 자동 요청은 빼고 세요. 최근 30일 동안 뺀 내부 방문은 ${num(k.last30.internal)}명이에요.</li>
    <li>월간·시즌 합계는 날마다 센 방문자를 더한 값이에요. 같은 분이 여러 날 오면 날마다 1명씩 세요.</li>
    <li>최근 30일 조회 수(새로 고침 포함)는 메인 ${num(k.last30.hitsMain)}회, 신청 ${num(k.last30.hitsRegister)}회예요.</li>
    <li>IP는 원문 없이 해시로만 ${v.policy.rawDays}일 보관하고, 그 뒤에는 날짜별 숫자만 ${v.policy.dailyYears}년 보관해요.</li></ul></div>`;
  return head + cards + dailyCard + monthCard + seasonCard + wdCard + foot;
}
