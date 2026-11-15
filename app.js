// 어디물어 모바일 웹(GitHub Pages). 비밀키 없음: 모든 데이터는 backend-go-fishing API 에서 받는다.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const won = n => n == null ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`;
const GATE = { PASS: '안전 양호', PASS_WITH_CAUTION: '조건부 주의', REVIEW_REQUIRED: '현장 확인', HARD_BLOCK: '출조 자제' };
const badge = g => g ? `<span class="badge b-${esc(g)}">${esc(GATE[g] ?? g)}</span>` : '';

// ---- 설정·인증(auth.js) ----
import { state, setApi, api, health, login, logout, startTimer, syncExpiry, saveAuth, setOnAuthLost, setOnMustChange, loadAuthImage, remaining, sessionMinutes } from './auth.js?v=1.3.3';
let SID = localStorage.getItem('gofishing.session') || (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2));
localStorage.setItem('gofishing.session', SID);
let slots = {}, lastBriefing = null, timer = null, usageText = '';
const authed = () => state.authMode === 'required';

function setStatus(text, cls = '') { const el = $('#status'); el.textContent = text; el.className = 'status ' + cls; }
async function checkServer() {
  if (!state.api) { setStatus('백엔드 미연결 · ⚙︎ 설정에서 서버 주소를 입력하세요', 'bad'); return null; }
  const h = await health();
  if (h.error) { setStatus(`서버 연결 실패 (${state.api}) · ${h.error}`, 'bad'); return null; }
  setStatus(`서버 연결됨 v${h.version} · ${authed() ? `로그인 세션 ${state.sessionMinutes}분` : '로그인 없음(개발 모드)'} · 기억 ${h.memory?.store ?? '-'}`, 'ok');
  return h;
}

// ---- 탭 ----
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'points') loadPoints();
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---- 대화 ----
const chat = $('#chat');
const scroll = () => { const t = $('#tab-chat'); t.scrollTop = t.scrollHeight; };
function bubble(role, html) { const d = document.createElement('div'); d.className = 'msg ' + role; d.innerHTML = html; chat.appendChild(d); scroll(); return d; }
function node(html, cls = 'card') { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; chat.appendChild(d); scroll(); return d; }

function renderChips() {
  const L = { gasoline: '휘발유', diesel: '경유', lpg: 'LPG', ev: '전기차' };
  const c = [];
  if (slots.origin?.coarse) c.push('🏠 ' + slots.origin.coarse);
  if (slots.date) c.push('📅 ' + slots.date.replaceAll('-', '.'));
  if (slots.region) c.push('🌊 ' + slots.region);
  if (slots.species) c.push('🐟 ' + slots.species);
  if (slots.experience) c.push('🎓 ' + slots.experience);
  if (slots.companion === '가족동반') c.push('👨‍👩‍👧 가족');
  if (slots.fuel) c.push('⛽ ' + (L[slots.fuel] ?? slots.fuel) + (slots.efficiency ? ` ${slots.efficiency}` : ''));
  $('#chips').innerHTML = (authed() && state.auth ? `<span class="chip" id="usageChip">${esc(usageText || '💬 질문 한도 확인 중')}</span>` : '') + (c.map(x => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">출발지·날짜·지역을 말씀해 주세요</span>');
}

function renderMessage(m) {
  switch (m.type) {
    case 'text': bubble('bot', md(m.text)); break;
    case 'actions': {
      const d = node('', 'actions');
      for (const b of m.buttons) { const el = document.createElement('button'); el.textContent = b.label; el.onclick = () => b.message.endsWith(' ') ? ($('#msg').value = b.message, $('#msg').focus()) : send(b.message); d.appendChild(el); }
      break;
    }
    case 'points_table': {
      const rows = m.rows.map(r => `<div class="prow" data-msg="${r.no}번 안내해줘"><div class="t"><span>${r.no}. ${esc(r.name)}</span><span class="sub">${esc(r.district)}</span></div>
        <div class="d">${esc(r.species)}</div><div class="c">${esc(r.cautions)}</div>
        <div class="d">허용: ${esc(r.restriction)} · 출처: ${esc((r.sources || []).join(', '))}</div></div>`).join('');
      const el = node(`<h3>${esc(m.region)} 대표 포인트</h3><div class="ptable">${rows}</div>`);
      el.querySelectorAll('.prow').forEach(p => p.onclick = () => send(p.dataset.msg));
      break;
    }
    case 'sea_summary': {
      const s = m.data; const tide = s.tide?.events?.map(e => `${e.type} ${e.time}`).join(' · ');
      node(`<h3>바다 상태 ${badge(s.gate)}</h3><div class="reason" style="white-space:pre-wrap">${md(s.text)}</div>
        ${s.grades?.length ? `<div class="grades">${s.grades.map(g => `<span class="grade">${esc(g.place)} <b>${esc(g.best)}</b> (${esc(g.species)}·${esc(g.period)})</span>`).join('')}</div>` : ''}
        <div class="sub" style="margin-top:6px">${tide ? `조석(${esc(s.tide.station)}): ${esc(tide)} · ` : ''}${s.sun?.sunrise ? `일출 ${esc(s.sun.sunrise)} · 일몰 ${esc(s.sun.sunset)}` : ''}</div>
        <div class="sub">${esc(s.tier?.badge ?? '')} · 기준 지점: ${esc(s.representative ?? '')}</div>`);
      break;
    }
    case 'top3': {
      const items = m.data.items.map(i => `<div class="item" data-msg="${i.rank}번 안내해줘">
        <div><span class="rank">${i.rank}</span><b>${esc(i.point.name)}</b> ${badge(i.safety.gate)}</div>
        <div class="sub">${esc(i.point.district)} · ${esc(i.point.type)}${i.travel ? ` · 🚗 ${i.travel.minutes}분 ${i.travel.km}km${i.travel.toll ? ' · 통행료 ' + won(i.travel.toll) : ''}` : ''}</div>
        ${i.score.total != null ? `<div class="bar"><i style="width:${Math.min(100, i.score.total)}%"></i></div><div class="sub">추천점수 ${i.score.total} (${esc(i.score.weights)})</div>` : ''}
        <div class="reason">${esc(i.score.reason)}</div>
        ${i.safety.reasons.length ? `<div class="sub">⚠︎ ${esc(i.safety.reasons.map(r => r.text).join(' / '))}</div>` : ''}</div>`).join('');
      const blocked = m.data.blocked?.length ? `<div class="sub" style="margin-top:8px">제외: ${esc(m.data.blocked.map(b => `${b.name}(${b.reason})`).join(', '))}</div>` : '';
      const el = node(`<h3>${esc(m.data.date)} 추천 TOP ${m.data.items.length}</h3><div class="sub">${esc(m.data.tier?.badge ?? '')}</div><div class="top3">${items}</div>${blocked}`);
      el.querySelectorAll('.item').forEach(p => p.onclick = () => send(p.dataset.msg));
      break;
    }
    case 'safety_block':
      node(`<h3>🚨 출조 자제 권고 ${m.data.point ? '· ' + esc(m.data.point) : ''}</h3><div class="sub">${esc(m.data.date)}</div><ul class="list">${m.data.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`, 'card block');
      break;
    case 'briefing': {
      lastBriefing = m.data; renderBriefing(m.data);
      const b = m.data;
      const r = b.routes?.options?.[0];
      const el = node(`<h3>${esc(b.point.name)} ${badge(b.safety.gate)}</h3><div class="sub">${esc(b.dateLabel)} · ${esc(b.sea.index ? `지수 ${b.sea.index.grade}(${b.sea.index.name})` : '지수 미제공')}${r?.minutes ? ` · 🚗 ${r.minutes}분` : ''}</div>
        <div class="actions" style="margin-top:8px"><button>🧭 상세 브리핑 보기</button></div>`);
      el.querySelector('button').onclick = () => showTab('brief');
      break;
    }
  }
}

async function send(text) {
  text = String(text || '').trim(); if (!text) return;
  showTab('chat');
  bubble('user', esc(text));
  const t = document.createElement('div'); t.className = 'typing'; t.textContent = '어디물어가 공공데이터를 조회하고 있어요…'; chat.appendChild(t); scroll();
  try {
    const r = await api('/v1/chat', { method: 'POST', body: JSON.stringify(authed() ? { message: text, client: 'pages' } : { sessionId: SID, message: text, client: 'pages' }) });
    t.remove();
    if (!authed() && r.sessionId && r.sessionId !== SID) { SID = r.sessionId; localStorage.setItem('gofishing.session', SID); }
    if (r.session) syncExpiry(r.session.remainingSec);
    if (r.usage) renderUsage(r.usage);
    slots = r.slots || slots; renderChips();
    r.messages.forEach(renderMessage);
  } catch (e) {
    t.remove();
    if (e.status === 401) return;                       // 자동 로그아웃 처리됨
    if (e.status === 429) { bubble('bot', md(`⏳ ${e.message}`)); if (e.usage) renderUsage({ today: { messages: e.usage.messages, tokens: e.usage.tokens } }); return; }
    if (e.status === 403) { bubble('bot', md(e.message)); return; }
    bubble('bot', md(`서버에 연결하지 못했어요. (${e.message})\n⚙︎ 설정에서 백엔드 주소를 확인해 주세요.`));
  }
}
$('#composer').addEventListener('submit', e => { e.preventDefault(); const v = $('#msg').value; $('#msg').value = ''; send(v); });

// ---- 브리핑 ----
function list(items, fmt, cls = '') { return items?.length ? `<ul class="list ${cls}">${items.map(fmt).join('')}</ul>` : '<div class="sub">결과 없음</div>'; }
function renderBriefing(b) {
  const s = b.sea; const fp = s.fishingPeriods || [];
  const rng = a => a && a[0] != null ? (a[0] === a[1] ? `${a[0]}` : `${a[0]}~${a[1]}`) : '-';
  const sw = s.shortWind, swave = s.shortWave;
  const metrics = [
    ['바다낚시지수', s.index ? `${s.index.grade}` : '미제공', s.index ? `${s.index.name}·${s.index.period}` : ''],
    ['물때', s.tidePhase ?? '-', ''], ['파고(m)', rng(s.waveRange) !== '-' ? rng(s.waveRange) : (swave?.am ? `${swave.am.min}~${Math.max(swave.am.max, swave.pm?.max ?? 0)}` : '-'), fp.length ? '지수 예보' : '단기예보'],
    ['최대풍속', s.windMax != null && s.windMax > -1 ? `${s.windMax}m/s` : (sw?.am ? `${Math.max(sw.am.max, sw.pm?.max ?? 0)}m/s` : '-'), ''],
    ['수온(°C)', rng(s.waterTemp), s.observation?.waterTemp != null ? `실측 ${s.observation.waterTemp}` : ''],
    ['기온(°C)', s.temp?.min != null ? `${s.temp.min}~${s.temp.max}` : '-', s.pop != null ? `강수 ${s.pop}%` : '']
  ].map(([l, v, x]) => `<div class="metric"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="l">${esc(x)}</div></div>`).join('');
  const tide = s.tide?.events?.map(e => `<li><span>${esc(e.type)} ${esc(e.time)}</span><span class="m">${e.levelCm ?? '-'}cm</span></li>`).join('') ?? '';
  const mid = s.mid?.periods?.map(p => `<li><span>${esc(p.period)} ${esc(p.seaWeather ?? '')}</span><span class="m">파고 ${p.waveMin ?? '-'}~${p.waveMax ?? '-'}m · 강수 ${p.rainProb ?? '-'}%</span></li>`).join('') ?? '';
  const warn = s.warnings ? (s.warnings.active.length ? s.warnings.active.map(w => `${w.kind}(${w.areas.join(', ')})`).join(' / ') : '관련 해역 발효 특보 없음') : '특보 확인 불가';
  const routes = b.routes ? `<table class="routes"><tr><th>경로</th><th>거리·시간</th><th>통행료</th><th>${esc(b.routes.fuel?.type ?? '연료')}비</th></tr>
      ${b.routes.options.map(o => o.km != null ? `<tr><td>${esc(o.name)}<div class="sub">${esc((o.via || []).slice(0, 5).join(' → '))}</div></td><td>${o.km}km<br>${o.minutes}분</td><td>${won(o.toll)}</td><td>${won(o.cost?.energy)}<div class="sub">왕복≈${won(o.cost?.roundTripEstimate)}</div></td></tr>` : `<tr><td>${esc(o.name)}</td><td colspan="3" class="sub">${esc(o.message ?? '조회 실패')}</td></tr>`).join('')}</table>
      <div class="sub">${esc(b.routes.note)}${b.routes.fuel?.price ? ` · ${esc(b.routes.fuel.type)} ${esc(b.routes.fuel.scope)} ${Math.round(b.routes.fuel.price).toLocaleString('ko-KR')}원/L(오피넷)` : ''}${b.routes.fuel?.note ? ' · ' + esc(b.routes.fuel.note) : ''} · 연비 ${esc(b.routes.fuel?.efficiency ?? '')}</div>
      <div class="links"><a href="${esc(b.routes.links.naverWeb)}" target="_blank" rel="noopener">네이버지도 길찾기</a><a href="${esc(b.routes.links.naverApp)}">네이버지도 앱</a></div>`
    : '<div class="sub">출발지를 알려 주시면 고속도로·일반도로 경로와 통행료·유류비를 계산합니다.</div>';
  const traffic = b.traffic ? (b.traffic.events.length ? list(b.traffic.events.slice(0, 5), e => `<li><span>${esc(e.type)}·${esc(e.detail)} · ${esc(e.road)} ${esc(e.start ?? '')}</span><span class="m">${esc(e.message)}</span></li>`, 'stack') : '<div class="sub">경로 주변 돌발상황 없음</div>') + `<div class="sub">${esc(b.traffic.note ?? '')}</div>` : '';
  const nearby = b.nearby.map(n => `<div style="margin-top:8px"><div class="sub"><b style="color:#e6edf7">${esc(n.title)}</b> ${n.radiusM ? `· 반경 ${n.radiusM / 1000}km${n.widened ? '(확장 검색)' : ''}` : ''}</div>
      ${n.status !== 'ok' ? `<div class="sub st-error">${esc(n.message ?? n.status)}</div>` : list(n.items.slice(0, 3), i => `<li><a href="${esc(i.url ?? '#')}" target="_blank" rel="noopener">${esc(i.name)}</a><span class="m">${i.price ? won(i.price) + ' · ' : ''}${i.distanceM != null ? (i.distanceM >= 1000 ? (i.distanceM / 1000).toFixed(1) + 'km' : i.distanceM + 'm') : ''}${i.phone ? ' · ' + esc(i.phone) : ''}</span></li>`)}</div>`).join('');
  const er = b.emergency?.name ? `<b>${esc(b.emergency.name)}</b> · ${b.emergency.distanceKm}km${b.emergency.phone ? ` · <a href="tel:${esc(b.emergency.phone)}">${esc(b.emergency.phone)}</a>` : ''}<div class="sub">${esc(b.emergency.note)}</div>` : `<div class="sub">${esc(b.emergency?.message ?? '')}</div>`;
  const srcs = b.sources.map(x => `<span class="st-${esc(x.status)}">● ${esc(x.provider)}(${esc(x.status)})</span>`).join('');
  $('#brief').innerHTML = `
    <div class="card"><h3>${esc(b.point.name)} ${badge(b.safety.gate)}</h3><div class="sub">${esc(b.point.region)} ${esc(b.point.district)} · ${esc(b.dateLabel)} · ${esc(s.tier?.badge ?? '')}</div>
      ${b.safety.reasons.length ? `<ul class="list" style="margin-top:6px">${b.safety.reasons.map(r => `<li><span>${esc(r.text)}</span></li>`).join('')}</ul>` : ''}<div class="sub" style="margin-top:4px">${esc(b.safety.note)} (${esc(b.safety.policy)})</div></div>
    <div class="card sec"><h4>■ 바다 (${esc(b.dateLabel)})</h4><div class="metrics">${metrics}</div>
      <div class="sub" style="margin-top:6px">특보: ${esc(warn)}${s.warnings?.issuedAt ? ` (특보현황 발표 ${esc(String(s.warnings.issuedAt).replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)$/, '$1-$2-$3 $4:$5'))})` : ''}</div>
      ${s.observation ? `<div class="sub">실측: ${esc(s.observation.name)}(${s.observation.distanceKm}km) 파고 ${s.observation.wave ?? '-'}m · 풍속 ${s.observation.wind ?? '-'}m/s · ${esc(s.observation.observedAt)}</div>` : ''}
      ${tide ? `<div style="margin-top:6px" class="sub">조석(${esc(s.tide.station)})</div><ul class="list">${tide}</ul>` : ''}
      ${mid ? `<div style="margin-top:6px" class="sub">중기예보(발표 ${esc(String(s.mid.tmFc).replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)$/, '$1-$2-$3 $4:$5'))})</div><ul class="list">${mid}</ul>` : ''}
      <div class="sub" style="margin-top:6px">일출 ${esc(s.sun?.sunrise ?? '-')} · 일몰 ${esc(s.sun?.sunset ?? '-')} (${esc(s.sun?.method ?? '')})${b.point.mapping?.indexPlace ? ` · 지수 해역: ${esc(b.point.mapping.indexPlace.name)}(${b.point.mapping.indexPlace.distanceKm}km)` : ''}</div></div>
    <div class="card sec"><h4>■ 포인트 정보</h4><dl class="kv"><dt>어종·장르</dt><dd>${esc(b.point.headline_species)}${b.point.methods?.length ? ' / ' + esc(b.point.methods.join('·')) : ''}</dd><dt>유형·난이도</dt><dd>${esc(b.point.type)} · ${esc(b.point.difficulty)}${b.point.family_friendly ? ' · 가족 적합' : ''}</dd>
      <dt>특징·주의</dt><dd>${esc(b.point.cautions)}</dd><dt>허용 여부</dt><dd>${esc(b.point.restriction_status)} — ${esc(b.point.restriction_note)}</dd>${b.point.walk_note ? `<dt>도보</dt><dd>${esc(b.point.walk_note)}</dd>` : ''}
      <dt>차량 목적지</dt><dd>${esc(b.point.access?.label ?? '미정')}</dd></dl></div>
    <div class="card sec map"><h4>■ 지도 (네이버)</h4><img alt="포인트 지도" data-auth-src="${esc(b.map.staticUrl)}"><div class="sub">P 낚시 자리 · C 차량 목적지 · S 출발지(약 100m 단위)</div></div>
    <div class="card sec"><h4>■ 가는 길 ${b.origin ? '(' + esc(b.origin.coarse) + ' 출발)' : ''}</h4>${routes}${traffic ? `<div style="margin-top:8px" class="sub"><b style="color:#e6edf7">실시간 돌발(ITS)</b></div>${traffic}` : ''}</div>
    <div class="card sec"><h4>■ 주변 정보</h4>${nearby}</div>
    <div class="card sec"><h4>■ 가장 가까운 응급실</h4>${er}</div>
    <div class="card sec"><h4>■ 안전 체크</h4><ul class="list check">${b.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
    <div class="card src"><b>출처·수집 상태</b><br>${srcs}<div class="disc">${esc(b.disclaimer)}</div></div>`;
  $('#brief').querySelectorAll('img[data-auth-src]').forEach(img => loadAuthImage(img, img.dataset.authSrc));
}

// ---- 포인트 탭 ----
async function loadPoints() {
  const region = slots.region || '부산';
  $('#points').innerHTML = '<p class="sub">불러오는 중…</p>';
  try {
    const r = await api('/v1/points?region=' + encodeURIComponent(region));
    const row = (p, i) => `<div class="prow" data-msg="${esc(p.name)} 안내해줘"><div class="t"><span>${esc(p.name)}</span><span class="sub">${esc(p.type)}</span></div><div class="d">${esc(p.district)}</div><div class="c">${esc(p.headline_species ?? '')}</div></div>`;
    $('#points').innerHTML = `<div class="card"><h3>${esc(region)} 검증 포인트 (${r.verified.length})</h3><div class="ptable">${r.verified.map(row).join('') || '<div class="sub">아직 없음</div>'}</div></div>
      <div class="card" style="margin-top:10px"><h3>국립해양조사원 지수 해역 (${r.official.length})</h3><div class="sub">해역 대표 좌표 · 낚시 자리는 현장 확인</div><div class="ptable">${r.official.map(row).join('')}</div></div>`;
    $('#points').querySelectorAll('.prow').forEach(p => p.onclick = () => send(p.dataset.msg));
  } catch (e) { $('#points').innerHTML = `<p class="sub">${esc(e.message)}</p>`; }
}

// ---- 설정 ----
async function openSettings() {
  $('#serverSettingsLink').hidden = true;
  if (state.auth?.token) {
    try { const me = await api('/v1/auth/me'); $('#serverSettingsLink').hidden = !(me.role === 'admin' && me.user.loginId === 'lonbehold' && !me.mustChangePassword); } catch { return; }
  }
  const a = state.auth;
  $('#accountBox').hidden = !(authed() && a);
  $('#resetSession').hidden = authed();
  if (a) { $('#accountInfo').textContent = `${a.user.displayName}(${a.user.loginId}) · ${a.user.role === 'admin' ? '관리자' : '테스터'} · 남은 시간 ${Math.floor(remaining() / 60)}분 ${remaining() % 60}초`; $('#adminLink').hidden = a.user.role !== 'admin'; }
  $('#settings').showModal();
}
$('#btnSettings').onclick = openSettings;
$('#btnLogout').onclick = () => { $('#settings').close(); endSession('로그아웃했습니다.', true); };
$('#btnPw').onclick = () => { $('#settings').close(); openPw(false); };
$('#resetSession').onclick = () => { SID = crypto.randomUUID?.() ?? String(Date.now()); localStorage.setItem('gofishing.session', SID); chat.innerHTML = ''; slots = {}; renderChips(); $('#settings').close(); welcome(); };

function welcome() {
  bubble('bot', md('안녕하세요! **어디물어**예요 🎣\n출발지와 날짜, 가고 싶은 지역을 알려 주시면 공공데이터로 바다 상태를 확인하고 포인트·가는 길·주변 정보까지 정리해 드릴게요.'));
  renderMessage({ type: 'actions', buttons: [
    { label: '오늘 부산 대표 포인트 알려줘', message: '오늘 부산 대표 포인트 알려줘' },
    { label: '이번주 토요일 부산 추천해줘', message: '이번주 토요일 부산 추천해줘' },
    { label: '출발지 입력', message: '출발지는 ' }] });
}
async function restore() {
  try {
    const r = await api('/v1/sessions' + (authed() ? '' : '?id=' + encodeURIComponent(SID)), { timeoutMs: 10000 });
    if (r.messages?.length) {
      chat.innerHTML = '';
      bubble('bot', md('이번 세션의 대화를 이어서 보여 드려요.'));
      r.messages.slice(-10).forEach(m => bubble(m.role === 'user' ? 'user' : 'bot', md(m.text)));
      slots = r.slots || {}; renderChips();
    }
  } catch { /* 기억 없음 */ }
}

// ---- 로그인·세션 ----
function renderUsage(u) {
  const parts = [];
  if (u.session?.limit) parts.push(`이번 세션 질문 ${u.session.messages}/${u.session.limit}`);
  if (u.today?.limit) parts.push(`오늘 ${u.today.messages}/${u.today.limit}`);
  const el = $('#usageInfo'); if (el) el.textContent = parts.join(' · ');
  if (parts.length) usageText = '💬 질문 ' + parts[0].replace('이번 세션 질문 ', '');
  const chip = document.getElementById('usageChip'); if (chip && usageText) chip.textContent = usageText;
}
function showLogin(msg = '', ok = false) {
  timer?.stop(); timer = null;
  $('#settings').close(); $('#serverSettingsLink').hidden = true;
  $('#appView').hidden = true; $('#loginView').hidden = false;
  $('#sessionMinutesNote').textContent = state.sessionMinutes;
  const m = $('#loginMsg'); m.textContent = msg; m.className = 'login-msg' + (ok ? ' ok' : '');
  setTimeout(() => $('#loginId').focus(), 50);
}
function enterApp() {
  $('#loginView').hidden = true; $('#appView').hidden = false;
  chat.innerHTML = ''; slots = {}; renderChips();
  if (authed() && state.auth) {
    timer?.stop();
    timer = startTimer($('#timer'), {
      onWarn: s => toast(`약 ${s}초 뒤 자동 로그아웃됩니다. 필요한 내용은 지금 확인해 주세요.`),
      onExpire: () => endSession(`${sessionMinutes()}분 이용 시간이 끝나 자동 로그아웃했습니다. 다시 로그인해 주세요.`, false, 'expired')
    });
    const u = state.auth.user;
    bubble('bot', md(`**${u.displayName}**님, 반가워요. 이번 로그인은 **${sessionMinutes()}분** 동안 이용할 수 있어요.`));
    refreshUsage();
  }
  welcome(); restore();
}
async function refreshUsage() {
  try {
    const me = await api('/v1/auth/me', { timeoutMs: 10000 });
    syncExpiry(me.remainingSec);
    renderUsage({ session: { messages: me.session.messages, limit: me.limits.sessionMessages }, today: { messages: me.usage.today.messages, limit: me.limits.dailyMessages } });
  } catch { /* 401 은 자동 로그아웃 처리 */ }
}
let ending = false;
function endSession(msg, ok = false, reason = 'logout') {
  if (ending) return; ending = true;
  logout(reason); timer?.stop(); timer = null; toast(''); usageText = '';
  chat.innerHTML = ''; $('#brief').innerHTML = '<p class="empty">포인트를 고르면 상세 브리핑이 여기에 표시됩니다.</p>'; slots = {}; renderChips();
  showLogin(msg, ok); ending = false;
}
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = !text; if (text) setTimeout(() => { if (t.textContent === text) t.hidden = true; }, 15000); }
setOnAuthLost(msg => endSession(msg, false, 'lost'));
setOnMustChange(() => openPw(true));

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginBtn'); btn.disabled = true; $('#loginMsg').textContent = '';
  try {
    const pwTyped = $('#loginPw').value;
    const r = await login($('#loginId').value.trim(), pwTyped);
    $('#loginPw').value = '';
    loginPwMemo = r.user.mustChangePassword ? pwTyped : '';
    if (r.replacedSessions) toast('다른 기기(또는 창)의 이전 로그인은 종료됐습니다.');
    if (r.user.mustChangePassword) openPw(true); else enterApp();
  } catch (err) { $('#loginMsg').textContent = err.message; }
  finally { btn.disabled = false; }
});

let pwForced = false, loginPwMemo = ''; // 첫 로그인 직후 비밀번호 변경 창에서만 쓰고 바로 지운다
function openPw(forced) {
  pwForced = forced; $('#pwReason').hidden = !forced; $('#pwCancel').textContent = forced ? '로그아웃' : '취소';
  $('#pwMsg').textContent = ''; $('#pwForm').reset();
  // 방금 로그인에 쓴 임시 비밀번호를 현재 비밀번호 칸에 채우고 숨긴다(다시 입력할 필요 없음)
  const curLabel = $('#pwCur').closest('label');
  if (forced && loginPwMemo) { $('#pwCur').value = loginPwMemo; curLabel.hidden = true; } else curLabel.hidden = false;
  if (!$('#pwDialog').open) $('#pwDialog').showModal();
}
$('#pwDialog').addEventListener('cancel', e => { if (pwForced) e.preventDefault(); });
$('#pwCancel').onclick = () => { loginPwMemo = ''; $('#pwDialog').close(); if (pwForced) endSession('로그아웃했습니다.', true); };
$('#pwForm').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('#pwNew').value !== $('#pwNew2').value) { $('#pwMsg').textContent = '새 비밀번호 확인이 일치하지 않습니다'; return; }
  try {
    await api('/v1/auth/password', { method: 'POST', body: JSON.stringify({ current: $('#pwCur').value, next: $('#pwNew').value }) });
    loginPwMemo = '';
    if (state.auth) saveAuth({ ...state.auth, user: { ...state.auth.user, mustChangePassword: false } });
    $('#pwDialog').close();
    if (pwForced) enterApp(); else toast('비밀번호를 바꿨습니다.');
  } catch (err) { $('#pwMsg').textContent = err.message; }
});

async function boot() {
  const h = await checkServer();
  if (h && authed()) {
    if (!state.auth?.token) return showLogin();
    try {
      const me = await api('/v1/auth/me', { timeoutMs: 10000 });
      syncExpiry(me.remainingSec);
      saveAuth({ ...state.auth, user: { ...state.auth.user, ...me.user, mustChangePassword: me.mustChangePassword } });
      if (me.mustChangePassword) return openPw(true);
      enterApp();
    } catch (e) { if (e.status !== 401) showLogin(e.message); }
    return;
  }
  // 서버에 연결되지 않으면 로그인 화면에서 안내(로그인 필요 서비스이므로 대화 화면을 먼저 열지 않음)
  if (!h) return showLogin(state.api ? '서버에 연결할 수 없습니다. 관리자에게 운영 서버 상태 확인을 요청해 주세요.' : '서버 주소가 설정되지 않았습니다. 관리자에게 연결된 접속 주소를 요청해 주세요.');
  // AUTH_MODE=off(로컬 개발 서버)일 때만 로그인 없이 바로 대화
  timer?.stop(); $('#loginView').hidden = true; $('#appView').hidden = false;
  chat.innerHTML = ''; welcome(); restore();
}

renderChips(); boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
