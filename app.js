// 어디물어 모바일 웹(GitHub Pages). 비밀키 없음: 모든 데이터는 backend-go-fishing API 에서 받는다.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const won = n => n == null ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`;
const GATE = { PASS: '안전 양호', PASS_WITH_CAUTION: '조건부 주의', REVIEW_REQUIRED: '현장 확인', HARD_BLOCK: '출조 자제' };
const badge = g => g ? `<span class="badge b-${esc(g)}">${esc(GATE[g] ?? g)}</span>` : '';

// ---- 설정·인증(auth.js) ----
import { state, setApi, api, health, login, logout, startTimer, syncExpiry, saveAuth, setOnAuthLost, setOnMustChange, loadAuthImage, remaining, sessionMinutes } from './auth.js?v=1.11.0';
let SID = localStorage.getItem('gofishing.session') || (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2));
localStorage.setItem('gofishing.session', SID);
let slots = {}, lastBriefing = null, timer = null, usageText = '';
const authed = () => state.authMode === 'required';

function setStatus(text, cls = '') { const el = $('#status'); el.textContent = text; el.className = 'status ' + cls; }
async function checkServer() {
  if (!state.api) { setStatus('백엔드 미연결 · ⚙︎ 설정에서 서버 주소를 입력하세요', 'bad'); return null; }
  const h = await health();
  if (h.error) { setStatus(`서버 연결 실패 (${state.api}) · ${h.error}`, 'bad'); return null; }
  setStatus(authed() ? `원활한 운영을 위해 로그인 세션 ${state.sessionMinutes}분 후 자동 로그아웃됩니다. 양해 부탁드립니다.` : `서버 연결됨 v${h.version} · 로그인 없음(개발 모드)`, 'ok');
  return h;
}

// ---- 탭 ----
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'points') loadPoints();
  if (name === 'opinion') resetOpinionMsg();
  if (name === 'history') loadHistory();
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
    case 'web_lookup': { // 공공데이터·API 에 자료가 없는 날짜: 공식 누리집 웹 검색으로 보완(검증 통과한 경우만 내용 표시)
      const d = bubble('bot web-ref', md(`🔎 ${m.region} ${m.date.replaceAll('-', '.')}은 아직 공공데이터 예보 범위 밖이라, 기상청·국립해양조사원 누리집에서 최신 전망을 찾아보고 있어요…`));
      api(`/v1/web-outlook?region=${encodeURIComponent(m.region)}&date=${m.date}`, { timeoutMs: 100000 }).then(r => {
        if (r.status === 'ok') {
          const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `${r.host} · ${r.published.replaceAll('-', '.')} 발표`;
          d.innerHTML = md(`**📰 공식 누리집 참고 자료** (웹 검색)\n${r.summary}`) + '<div class="web-ref-src">출처: </div><div class="web-ref-note">공식 예보 API 수치가 아니라 참고용이며, 안전 판단에는 쓰지 않아요. 출조 10일 전부터 중기예보, 2~3일 전에는 상세 예보로 다시 확인해 주세요.</div>';
          d.querySelector('.web-ref-src').appendChild(a);
        } else if (r.status === 'limit') d.innerHTML = md('오늘은 누리집 검색을 더 할 수 없어요. 날짜가 가까워지면 다시 물어봐 주세요.');
        else d.innerHTML = md(`공식 누리집에서도 ${m.date.replaceAll('-', '.')} 무렵의 믿을 만한 최신 전망을 찾지 못했어요. 출조 10일 전부터는 기상청 중기예보로 안내해 드릴 수 있으니 그때 다시 물어봐 주세요.`);
        scroll();
      }).catch(() => { d.innerHTML = md('누리집 검색에 실패했어요. 잠시 후 다시 물어봐 주세요.'); });
      break;
    }
    case 'actions': {
      const d = node('', 'actions');
      for (const b of m.buttons) { const el = document.createElement('button'); el.textContent = b.label; el.onclick = () => (b.message === '출발지는 ' && authed() && state.auth) ? openOriginDialog() : b.message.endsWith(' ') ? ($('#msg').value = b.message, $('#msg').focus()) : send(b.message, b.pointId ? { pointId: b.pointId, date: b.date } : {}); d.appendChild(el); }
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

// ---- AI 크레딧 소진 잠금: 메인 화면의 모든 입력·버튼을 막고 안내만 보여 준다(관리자는 관리자 페이지 이동 가능) ----
let aiLocked = false;
const AI_DEFAULT_MSG = '지금은 AI 이용량이 모두 소진되어 어디물어를 잠시 이용할 수 없어요. 관리자가 확인한 뒤 최대한 빨리 다시 열어 드릴게요. 기다려 주셔서 감사합니다.';
function applyAiLock(ai) {
  if (!ai || ai.available !== false) return;
  aiLocked = true;
  const view = $('#appView');
  view.classList.add('ai-locked');
  $('#aiLockMsg').textContent = ai.message || AI_DEFAULT_MSG;
  $('#aiLockAdmin').hidden = state.auth?.user?.role !== 'admin';
  $('#aiLock').hidden = false;
  view.querySelectorAll('input, button, textarea, select').forEach(el => { if (!el.closest('#aiLock')) { el.disabled = true; el.setAttribute('aria-disabled', 'true'); } });
  view.querySelectorAll('a').forEach(el => { if (!el.closest('#aiLock')) { el.setAttribute('aria-disabled', 'true'); el.tabIndex = -1; } });
  $('#settings')?.open && $('#settings').close();
  toast('');
}
function clearAiLock() {
  if (!aiLocked) return; aiLocked = false;
  const view = $('#appView'); view.classList.remove('ai-locked'); $('#aiLock').hidden = true;
  view.querySelectorAll('[aria-disabled="true"]').forEach(el => { el.disabled = false; el.removeAttribute('aria-disabled'); if (el.tagName === 'A') el.removeAttribute('tabindex'); });
}
// 잠금 후 새로 그려지는 버튼(대화 응답의 선택 버튼 등)도 막는다
new MutationObserver(() => { if (aiLocked) $('#appView').querySelectorAll('button:not([disabled]), input:not([disabled])').forEach(el => { if (!el.closest('#aiLock')) el.disabled = true; }); }).observe(document.getElementById('appView'), { childList: true, subtree: true });
$('#aiLockLogout').onclick = () => { clearAiLock(); endSession('로그아웃했습니다.', true); };

// ---- 출발지(최대 5곳): 상단 스와이프 탭으로 고르고, 없으면 말풍선으로 등록을 권한다 ----
let origins = [], originMax = 5, originTipTimer = null, originNudgeTimer = null;
const activeOrigin = () => origins.find(o => o.active) ?? null;
const TIP_FIRST = '어디서 출발하세요? 🚗\n출발지를 등록해 두시면 하루에 한 번, 가까운 바다낚시 포인트와 오늘 오전·오후 날씨를 골라서 먼저 알려 드릴게요. 가는 길·이동 시간까지 함께 챙겨 드려요.\n출발지는 최대 5곳까지 등록할 수 있어요.';
const TIP_MORE = '출발지는 5곳까지 등록해 둘 수 있어요. 위에서 눌러 바로 바꿔 보세요 🙂';
function renderOrigins() {
  const bar = $('#originBar'), box = $('#originChips');
  bar.hidden = !(authed() && state.auth);
  if (bar.hidden) return;
  box.innerHTML = '';
  for (const o of origins) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'origin-chip' + (o.active ? ' active' : ''); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(o.active)); b.title = o.coarse;
    b.innerHTML = '<span aria-hidden="true">📍</span>' + esc(o.label);
    b.onclick = () => o.active ? openOriginDialog() : chooseOrigin(o);
    box.appendChild(b);
  }
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'origin-chip add';
  add.textContent = origins.length ? (origins.length < originMax ? '＋ 출발지 추가' : '편집') : '＋ 출발지 등록';
  add.onclick = openOriginDialog; box.appendChild(add);
  box.querySelector('.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
async function loadOrigins() {
  if (!authed() || !state.auth) return;
  try { const r = await api('/v1/origins', { timeoutMs: 10000 }); origins = r.origins; originMax = r.max ?? 5; } catch { origins = []; }
  renderOrigins(); nudgeOrigins();
}
function showOriginTip(text) {
  if (aiLocked) return;
  $('#originTipText').textContent = text; $('#originTip').hidden = false;
  clearTimeout(originTipTimer); originTipTimer = setTimeout(hideOriginTip, 15000);
}
function hideOriginTip() { $('#originTip').hidden = true; clearTimeout(originTipTimer); }
/** 가끔씩 안내: 출발지가 없으면 로그인할 때마다 + 3분 뒤 한 번 더, 1~4곳이면 사흘에 한 번 */
function nudgeOrigins() {
  clearTimeout(originNudgeTimer);
  if (!origins.length) {
    showOriginTip(TIP_FIRST);
    originNudgeTimer = setTimeout(() => { if (state.auth && !origins.length) showOriginTip(TIP_FIRST); }, 180000);
  } else if (origins.length < originMax) {
    const last = Number(localStorage.getItem('gofishing.originTipAt') || 0);
    if (Date.now() - last > 3 * 86400000) { localStorage.setItem('gofishing.originTipAt', String(Date.now())); showOriginTip(TIP_MORE); }
  }
}
async function chooseOrigin(o) {
  try { const r = await api(`/v1/origins/${o.id}/select`, { method: 'POST', body: '{}' }); origins = r.origins; renderOrigins(); toast(`출발지를 ${o.label}(으)로 바꿨어요.`); }
  catch (e) { toast(e.message); }
}
function renderOriginList() {
  $('#originCount').textContent = `${origins.length}/${originMax}`;
  const full = origins.length >= originMax;
  $('#originInput').disabled = full; $('#originAddBtn').disabled = full;
  $('#originInput').placeholder = full ? '5곳을 모두 등록했어요. 하나를 지우면 추가할 수 있어요' : '도로명·지번 주소 또는 동네 이름';
  $('#postcodeOpen').disabled = full;
  $('#originList').innerHTML = origins.length ? origins.map(o => `<li class="origin-item${o.active ? ' active' : ''}"><div class="origin-item-text"><b>${esc(o.label)}</b>${o.active ? ' <span class="origin-badge">사용 중</span>' : ''}<span>${esc(o.coarse)}</span></div><div class="origin-item-acts">${o.active ? '' : `<button type="button" data-use="${o.id}">사용</button>`}<button type="button" class="danger" data-del="${o.id}" aria-label="${esc(o.label)} 삭제">삭제</button></div></li>`).join('') : '<li class="origin-empty">아직 등록한 출발지가 없어요.</li>';
  $('#originList').querySelectorAll('[data-use]').forEach(b => b.onclick = async () => { const o = origins.find(x => String(x.id) === b.dataset.use); await chooseOrigin(o); renderOriginList(); });
  $('#originList').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const o = origins.find(x => String(x.id) === b.dataset.del); if (!confirm(`'${o.label}' 출발지를 지울까요?`)) return;
    try { const r = await api(`/v1/origins/${o.id}/delete`, { method: 'POST', body: '{}' }); origins = r.origins; renderOrigins(); renderOriginList(); } catch (e) { $('#originFormMsg').textContent = originError(e); }
  });
}
// ---- 다음(카카오) 우편번호 서비스: 도로명·지번 주소 검색. 키 없이 쓰는 공개 스크립트를 처음 열 때만 불러온다. ----
let postcodeLoading = null;
function loadPostcode() {
  if (window.daum?.Postcode) return Promise.resolve();
  return postcodeLoading ??= new Promise((ok, no) => {
    const urls = ['https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js', 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'];
    const tryNext = i => { if (i >= urls.length) { postcodeLoading = null; return no(new Error('주소 검색을 불러오지 못했어요. 동네 이름으로 입력해 주세요.')); }
      const s = document.createElement('script'); s.src = urls[i]; s.async = true; s.onload = () => ok(); s.onerror = () => { s.remove(); tryNext(i + 1); }; document.head.appendChild(s); };
    tryNext(0);
  });
}
/** 주소 형식(도로명 …로/…길 + 번호, 지번 번호)인지 */
const looksLikeAddress = t => /(로|길)\s*\d|번길|\d+(-\d+)?\s*(번지)?$/.test(String(t).trim());
async function openPostcode(query = '') {
  const msg = $('#originFormMsg');
  try { await loadPostcode(); } catch (e) { msg.textContent = e.message; return; }
  const wrap = $('#postcodeWrap'), box = $('#postcodeBox'); box.innerHTML = ''; wrap.hidden = false;
  new window.daum.Postcode({
    width: '100%', height: '100%',
    oncomplete: d => {
      // 서버에는 시·도 시·군·구 읍·면·동까지만 보낸다(도로명·건물번호는 보내지도 저장하지도 않음)
      const town = d.bname1 || d.bname || '';
      const coarse = [d.sido, d.sigungu, town].filter(Boolean).join(' ');
      wrap.hidden = true; box.innerHTML = '';
      $('#originInput').value = d.roadAddress || d.jibunAddress || coarse;
      addOrigin(coarse, true);
    }
  }).embed(box, { q: query, autoClose: false });
  wrap.scrollIntoView({ block: 'nearest' });
}
$('#postcodeOpen').onclick = () => { $('#originFormMsg').textContent = ''; openPostcode($('#originInput').value.trim()); };
$('#postcodeClose').onclick = () => { $('#postcodeWrap').hidden = true; $('#postcodeBox').innerHTML = ''; };
const originError = e => e.status === 404 && !e.code ? '출발지 기능이 아직 서버에 적용되지 않았어요. 관리자가 서버를 업데이트하면 바로 쓸 수 있어요.' : e.message;
async function addOrigin(text, fromSearch = false) {
  const input = $('#originInput'), btn = $('#originAddBtn'), msg = $('#originFormMsg');
  btn.disabled = true; btn.textContent = '찾는 중…'; msg.textContent = '';
  try {
    const r = await api('/v1/origins', { method: 'POST', body: JSON.stringify({ text }) });
    const wasEmpty = !origins.length;
    origins = r.origins; input.value = ''; renderOrigins(); renderOriginList();
    toast(`'${r.origin.label}'을(를) 출발지로 등록했어요.`);
    if (wasEmpty) { hideOriginTip(); showNearby(); }  // 첫 출발지를 등록하면 바로 주변 포인트를 추천
    return true;
  } catch (err) {
    // 주소처럼 보이는데 못 찾았으면 주소 검색을 바로 열어 고를 수 있게 한다
    if (err.code === 'ORIGIN_NOT_FOUND' && !fromSearch && looksLikeAddress(text)) { msg.textContent = '주소를 정확히 찾지 못했어요. 아래 주소 검색에서 골라 주세요.'; openPostcode(text); }
    else msg.textContent = originError(err);
    return false;
  } finally { btn.textContent = '추가'; renderOriginList(); }
}
function openOriginDialog() { hideOriginTip(); $('#originFormMsg').textContent = ''; $('#postcodeWrap').hidden = true; $('#postcodeBox').innerHTML = ''; renderOriginList(); $('#originDialog').showModal(); if (origins.length < originMax) setTimeout(() => $('#originInput').focus(), 50); }
$('#originDialogClose').onclick = () => { $('#postcodeWrap').hidden = true; $('#postcodeBox').innerHTML = ''; $('#originDialog').close(); };
$('#originTipAdd').onclick = openOriginDialog;
$('#originTipClose').onclick = hideOriginTip;
$('#originForm').addEventListener('submit', async e => {
  e.preventDefault(); const input = $('#originInput'), btn = $('#originAddBtn'), msg = $('#originFormMsg');
  const text = input.value.trim(); if (!text) { msg.textContent = '주소나 동네 이름을 적어 주세요.'; return; }
  await addOrigin(text);
});

async function send(text, extra = {}) {
  if (aiLocked) return;
  text = String(text || '').trim(); if (!text) return;
  showTab('chat');
  bubble('user', esc(text));
  const t = document.createElement('div'); t.className = 'typing'; t.textContent = '어디물어가 공공데이터를 조회하고 있어요…'; chat.appendChild(t); scroll();
  try {
    const r = await api('/v1/chat', { method: 'POST', body: JSON.stringify({ ...(authed() ? { message: text, client: 'pages', ...(activeOrigin() ? { originLabel: activeOrigin().coarse } : {}) } : { sessionId: SID, message: text, client: 'pages' }), ...extra }) });
    t.remove();
    if (!authed() && r.sessionId && r.sessionId !== SID) { SID = r.sessionId; localStorage.setItem('gofishing.session', SID); }
    if (r.session) syncExpiry(r.session.remainingSec);
    if (r.usage) renderUsage(r.usage);
    if (r.ai) applyAiLock(r.ai);
    slots = r.slots || slots; renderChips();
    r.messages.forEach(renderMessage);
  } catch (e) {
    t.remove();
    if (e.status === 401) return;                       // 자동 로그아웃 처리됨
    if (e.code === 'AI_CREDIT_EXHAUSTED') { applyAiLock({ available: false, message: e.message }); return; }
    if (e.status === 429) { bubble('bot', md(`⏳ ${e.message}`)); if (e.usage) renderUsage({ today: { messages: e.usage.messages, tokens: e.usage.tokens } }); return; }
    if (e.status === 403) { bubble('bot', md(e.message)); return; }
    bubble('bot', md(`서버에 연결하지 못했어요. (${e.message})\n⚙︎ 설정에서 백엔드 주소를 확인해 주세요.`));
  }
}
$('#composer').addEventListener('submit', e => { e.preventDefault(); const v = $('#msg').value; $('#msg').value = ''; send(v); });

// ---- 브리핑 ----
function list(items, fmt, cls = '') { return items?.length ? `<ul class="list ${cls}">${items.map(fmt).join('')}</ul>` : '<div class="sub">결과 없음</div>'; }
// ---- 브리핑 추가 공공데이터(v1.9.0): 조위 곡선·해와 달·부이 실황·선박운항지수·기상청 통보문 ----
const SHIP_CLS = { 매우좋음: 'PASS', 좋음: 'PASS', 보통: 'REVIEW_REQUIRED', 나쁨: 'PASS_WITH_CAUTION', 매우나쁨: 'HARD_BLOCK' };
function tideChart(level, events = [], date) {
  const h = (level?.hourly ?? []).filter(x => x.predictedCm != null);
  if (h.length < 2) return '';
  const W = 320, H = 132, P = 18, vals = h.flatMap(x => [x.predictedCm, x.observedCm].filter(v => v != null));
  const lo = Math.min(...vals), hi = Math.max(...vals), sx = i => P + i * (W - 2 * P) / 23, sy = v => H - 36 - (v - lo) / ((hi - lo) || 1) * (H - 58);
  const mins = t => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const line = h.map(x => `${sx(mins(x.time) / 60).toFixed(1)},${sy(x.predictedCm).toFixed(1)}`).join(' ');
  const obs = h.filter(x => x.observedCm != null).map(x => `<circle cx="${sx(mins(x.time) / 60).toFixed(1)}" cy="${sy(x.observedCm).toFixed(1)}" r="2.2" class="tc-obs"/>`).join('');
  const ev = events.map(e => { const x = sx(mins(e.time) / 60), y = sy(e.levelCm ?? lo); return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="${e.type === '만조' ? 'tc-high' : 'tc-low'}"/><text x="${x.toFixed(1)}" y="${(e.type === '만조' ? y - 7 : y + 13).toFixed(1)}" class="tc-lbl">${esc(e.type === '만조' ? '만' : '간')} ${esc(e.time)}</text></g>`; }).join('');
  const now = new Date(Date.now() + 9 * 3600e3); const nowX = now.toISOString().slice(0, 10) === date ? sx((now.getUTCHours() * 60 + now.getUTCMinutes()) / 60) : null;
  const ticks = [0, 6, 12, 18, 24].map(t => `<text x="${sx(t).toFixed(1)}" y="${H - 4}" class="tc-tick">${t}시</text>`).join('');
  return `<svg class="tide-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="시간별 예측 조위"><polyline points="${line}" class="tc-line"/>${obs}${nowX != null ? `<line x1="${nowX.toFixed(1)}" x2="${nowX.toFixed(1)}" y1="6" y2="${H - 18}" class="tc-now"/>` : ''}${ev}${ticks}</svg>`;
}
function marineCard(b) {
  const s = b.sea, parts = [];
  const chart = tideChart(s.tideLevel, s.tide?.events, b.date);
  if (chart) parts.push(`<div class="mc-block"><div class="mc-title">🌊 물때·조위 <span class="sub">${esc(s.tideLevel.stationName)} 조위관측소 · 선 예측${s.tideLevel.hourly.some(x => x.observedCm != null) ? ' · 점 실측' : ''}</span></div>${chart}</div>`);
  const sun = s.sun ?? {};
  if (sun.sunrise) parts.push(`<div class="mc-block"><div class="mc-title">☀️ 해와 달 <span class="sub">${esc(sun.method ?? '')}${sun.location ? ' · ' + esc(sun.location) + ' 기준' : ''}</span></div><div class="mc-grid">
    <div><span>일출</span><b>${esc(sun.sunrise)}</b></div><div><span>일몰</span><b>${esc(sun.sunset ?? '-')}</b></div>
    ${sun.civilDawn ? `<div><span>새벽 밝아짐</span><b>${esc(sun.civilDawn)}</b></div><div><span>저녁 어두워짐</span><b>${esc(sun.civilDusk ?? '-')}</b></div>` : ''}
    ${'moonrise' in sun ? `<div><span>월출</span><b>${esc(sun.moonrise ?? '없음')}</b></div><div><span>월몰</span><b>${esc(sun.moonset ?? '없음')}</b></div>` : ''}</div></div>`);
  if (s.buoy) { const o = s.buoy; parts.push(`<div class="mc-block"><div class="mc-title">📡 지금 바다(부이 실측) <span class="sub">${esc(o.name)} ${o.distanceKm}km · ${esc(String(o.observedAt).slice(11, 16))} 관측</span></div><div class="mc-grid">
    <div><span>파고</span><b>${o.wave ?? '-'}m</b></div><div><span>파주기</span><b>${o.wavePeriod ?? '-'}초</b></div><div><span>풍속(순간)</span><b>${o.wind ?? '-'}(${o.gust ?? '-'})m/s</b></div>
    <div><span>수온</span><b>${o.waterTemp != null ? o.waterTemp.toFixed(1) : '-'}°C</b></div><div><span>기온</span><b>${o.airTemp ?? '-'}°C</b></div><div><span>유속</span><b>${o.current ?? '-'}cm/s</b></div></div></div>`); }
  if (s.ship) parts.push(`<div class="mc-block"><div class="mc-title">⛵ 선박운항지수 <span class="sub">${esc(s.ship.name)} ${esc(s.ship.kind)}${s.ship.distanceKm != null ? ` ${s.ship.distanceKm}km` : ''} · ${esc(s.ship.lastDate ?? '')}까지 제공</span></div><div class="mc-ship">${s.ship.slots.map(x => `<div><span>${esc(x.slot)}</span><span class="badge b-${SHIP_CLS[x.grade] ?? 'REVIEW_REQUIRED'}">${esc(x.grade)}</span><small>파고 ${x.wave ?? '-'}m · 바람 ${x.wind ?? '-'}m/s</small></div>`).join('')}</div></div>`);
  if (s.forecastText) { const d = Number(String(b.date).slice(8)); const day = s.forecastText.days.find(x => x.label.includes(`${d}일`));
    parts.push(`<div class="mc-block"><div class="mc-title">📝 기상청 예보 통보문 <span class="sub">${esc(String(s.forecastText.issuedAt).replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)$/, '$2.$3 $4:$5'))} 발표</span></div>${s.forecastText.summary ? `<p class="mc-text"><b>종합</b> ${esc(s.forecastText.summary)}</p>` : ''}${day ? `<p class="mc-text"><b>${esc(day.label)}</b> ${esc(day.text)}</p>` : ''}</div>`); }
  return parts.length ? `<div class="card sec marine"><h4>■ 물때·해와 달·해상 상황</h4>${parts.join('')}</div>` : '';
}
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
    ${marineCard(b)}
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
  if (a) { $('#accountInfo').textContent = `${a.user.displayName}(${a.user.loginId}) · ${({ admin: '관리자', tester: '테스터', user: '일반' })[a.user.role] ?? a.user.role} · 남은 시간 ${Math.floor(remaining() / 60)}분 ${remaining() % 60}초`; $('#adminLink').hidden = a.user.role !== 'admin'; }
  $('#settings').showModal();
}
$('#btnSettings').onclick = openSettings;
$('#btnLogout').onclick = () => {
  const role = state.auth?.user?.role; $('#settings').close(); endSession('로그아웃했습니다.', true);
  // 일반 사용자는 로그인한 시각부터 24시간 뒤에 다시 이용할 수 있어 내일 방문을 안내, 관리자·테스터는 바로 다시 로그인 가능
  showNotice('로그아웃되었습니다', role === 'user'
    ? '오늘도 어디물어를 이용해 주셔서 감사합니다.\n내일 다시 찾아 주시면 바다 소식 전해 드릴게요. 🎣'
    : '이용해 주셔서 감사합니다.\n필요하실 때 언제든 다시 로그인해 주세요.');
};
$('#btnPw').onclick = () => { $('#settings').close(); openPw(false); };
$('#resetSession').onclick = () => { SID = crypto.randomUUID?.() ?? String(Date.now()); localStorage.setItem('gofishing.session', SID); chat.innerHTML = ''; slots = {}; renderChips(); $('#settings').close(); welcome(); };

// ---- 오늘의 추천 말풍선: 내가 찾아본 포인트 중 한 곳을 오늘 예보로 짧게(무작위). 음성은 버튼을 눌렀을 때만 재생. ----
// ---- 하단 '의견' 탭: 별점(선택)+의견 500자 ----
let opinionRating = null;
function setOpinionRating(v) {
  opinionRating = opinionRating === v ? null : v;
  document.querySelectorAll('.op-star').forEach(b => { const on = opinionRating && Number(b.dataset.v) <= opinionRating; b.classList.toggle('on', !!on); b.setAttribute('aria-checked', String(Number(b.dataset.v) === opinionRating)); });
}
function resetOpinionMsg() { $('#opinionMsg').textContent = ''; $('#opinionMsg').className = 'login-msg'; $('#opinionSend').disabled = false; }
document.querySelectorAll('.op-star').forEach(b => b.onclick = () => setOpinionRating(Number(b.dataset.v)));
$('#opinionText').addEventListener('input', () => { $('#opinionCount').textContent = `${$('#opinionText').value.length}/500`; });
$('#opinionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#opinionText').value.trim(), m = $('#opinionMsg'), btn = $('#opinionSend');
  if (!text) { m.textContent = '의견을 한 줄이라도 적어 주세요.'; return; }
  btn.disabled = true; m.textContent = '';
  try {
    await api('/v1/opinions', { method: 'POST', body: JSON.stringify({ rating: opinionRating, text }) });
    $('#opinionText').value = ''; $('#opinionCount').textContent = '0/500'; opinionRating = 1; setOpinionRating(1);
    resetOpinionMsg(); showTab('chat'); toast('소중한 의견 감사합니다! 꼼꼼히 읽고 더 나은 어디물어로 보답할게요. 🙏');
  } catch (err) { m.textContent = err.message || '의견을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
  finally { btn.disabled = false; }
});

// ---- 로그인 위치: 브라우저가 위치 허용을 묻고, 허용한 경우만 세션당 1회 저장(서버에서 약 100m 단위로 반올림) ----
function recordLoginLocation() {
  const sid = state.auth?.token?.slice(-12); if (!sid || sessionStorage.getItem('gofishing.locAsked') === sid) return;
  sessionStorage.setItem('gofishing.locAsked', sid);
  const post = body => api('/v1/auth/location', { method: 'POST', body: JSON.stringify(body), timeoutMs: 10000 }).catch(() => {});
  if (!navigator.geolocation) return post({ status: 'unavailable' });
  navigator.geolocation.getCurrentPosition(
    p => post({ status: 'granted', lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
    e => post({ status: e.code === 1 ? 'denied' : 'unavailable' }),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

// ---- 내 대화 기록(최근 30일) ----
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kst = iso => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return { date: `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}(${WD[d.getUTCDay()]})`, time: d.toISOString().slice(11, 16) }; };
async function loadHistory() {
  const box = $('#history'); if (!state.auth) return;
  box.innerHTML = '<p class="empty">대화 기록을 불러오는 중이에요…</p>';
  try {
    const { sessions } = await api('/v1/me/history', { timeoutMs: 15000 });
    if (!sessions.length) { box.innerHTML = '<p class="empty">아직 저장된 대화가 없어요. 대화 탭에서 궁금한 바다를 물어보세요!</p>'; return; }
    box.innerHTML = sessions.map((s, i) => { const t = kst(s.startedAt), q = s.messages.filter(m => m.role === 'user').length;
      return `<details class="hist-sess"${i === 0 ? ' open' : ''}><summary><span><b>${esc(t.date)}</b> ${esc(t.time)} 로그인</span><span class="hist-n">질문 ${q}개</span></summary><div class="hist-msgs">${s.messages.map(m => m.role === 'user'
        ? `<div class="msg user">${esc(m.content)}</div><div class="hist-re"><span>${esc(kst(m.at).time)}</span><button type="button" data-ask="${esc(m.content)}">다시 묻기</button></div>`
        : `<div class="msg bot">${md(m.content)}</div>`).join('')}</div></details>`; }).join('') + '<p class="hist-hint">대화는 서비스 개선과 운영을 위해 30일간 보관된 뒤 자동으로 지워져요.</p>';
    box.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => { showTab('chat'); send(b.dataset.ask); });
  } catch (e) { box.innerHTML = `<p class="empty">대화 기록을 불러오지 못했어요. ${esc(e.message || '')}</p>`; }
}
$('#btnHistory').onclick = () => showTab('history');
$('#btnHistory2').onclick = () => { $('#settings').close(); showTab('history'); };
$('#historyBack').onclick = () => showTab('chat');

// ---- 하루 한 번 추천 말풍선: 대화 기록 → 없으면 출발지 주변 ----
const dailyKey = () => 'gofishing.dailyAt.' + (state.auth?.user?.id ?? '');
async function showDailyTip() {
  if (!state.auth || aiLocked || localStorage.getItem(dailyKey()) === kstToday()) return false;
  try {
    const t = await api('/v1/suggest/daily', { timeoutMs: 30000 });
    if (!t?.available || aiLocked || !state.auth) return false;
    localStorage.setItem(dailyKey(), kstToday());
    todayTipData = t;
    $('#todayTipBadge').textContent = `🎣 오늘의 추천 · ${t.basisLabel}`;
    $('#todayTipText').textContent = t.text;
    $('#todayTipSrc').textContent = t.source ? '출처: ' + t.source : '';
    $('#todayTipVoice').hidden = !(t.voice && t.speechId); $('#todayTipVoice').textContent = '🔊 듣기'; $('#todayTipVoice').disabled = false;
    $('#todayTipMore').hidden = !t.actions?.length;
    $('#todayTipNearby').hidden = !(t.basis === 'origin' && t.more);
    if (todayAudioUrl) { URL.revokeObjectURL(todayAudioUrl); todayAudioUrl = null; todayAudio = null; }
    $('#todayTip').hidden = false;
    return true;
  } catch { return false; }
}

// ---- 출발지 주변 포인트 추천(첫 출발지 등록 때·말풍선의 '주변 더 보기') ----
const GATE_TEXT = { PASS: '출조 무난', PASS_WITH_CAUTION: '주의', REVIEW_REQUIRED: '판단 보류', HARD_BLOCK: '쉬어 가세요' };
const nearbyKey = () => 'gofishing.nearbyAt.' + (state.auth?.user?.id ?? '');
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
/** 오늘 아직 안 보여 줬으면 주변 추천을 대화에 띄운다. 띄웠으면 true */
async function showNearby(force = false) {
  if (!state.auth || aiLocked || (!force && localStorage.getItem(nearbyKey()) === kstToday())) return false;
  const wait = bubble('bot typing-note', '📍 출발지 주변 포인트와 오늘 날씨를 살펴보는 중이에요…');
  try {
    const r = await api('/v1/suggest/nearby', { timeoutMs: 30000 });
    wait.remove();
    if (!state.auth) return false;
    if (!r?.available) { if (r?.reason === 'no-points' && r.text) { bubble('bot', esc(r.text)); localStorage.setItem(nearbyKey(), kstToday()); return true; } return false; }
    localStorage.setItem(nearbyKey(), kstToday());
    const items = r.items.map(i => {
      const line = [i.am ? `<span class="nb-slot">오전</span> ${esc(i.am)}` : '', i.pm ? `<span class="nb-slot">오후</span> ${esc(i.pm)}` : ''].filter(Boolean).join('<br>') || '<span class="sub">오늘 예보를 아직 받지 못했어요</span>';
      const click = i.gate !== 'HARD_BLOCK';
      return `<${click ? 'button type="button"' : 'div'} class="item nb-item" ${click ? `data-nb="${esc(i.id)}"` : ''}><div class="nb-head"><span class="rank">${i.rank}</span><b>${esc(i.name)}</b><span class="nb-dist">${i.distanceKm}km</span><span class="badge b-${esc(i.gate)}">${esc(GATE_TEXT[i.gate] ?? i.verdict)}</span></div><div class="nb-wx">${line}</div></${click ? 'button' : 'div'}>`;
    }).join('');
    const card = node(`<h3>📍 ${esc(r.origin.label)} 주변 오늘의 포인트</h3><p class="nb-intro">${esc(r.text).replace(/\n/g, '<br>')}</p>${items}${r.source ? `<p class="src">출처: ${esc(r.source)} · 반경 ${r.radiusKm}km · 출입·낚시 허용은 현장 안내판을 꼭 확인해 주세요</p>` : ''}`, 'card top3 nearby');
    card.querySelectorAll('[data-nb]').forEach(b => b.onclick = () => { const a = r.actions.find(x => x.pointId === b.dataset.nb); if (a) send(a.message, { pointId: a.pointId, date: a.date }); });
    return true;
  } catch { wait.remove(); return false; }
}

let todayTipData = null, todayAudio = null, todayAudioUrl = null;
function hideTodayTip() { $('#todayTip').hidden = true; if (todayAudio) { todayAudio.pause(); } }
async function showTodayTip() {
  try {
    const t = await api('/v1/suggest/today', { timeoutMs: 20000 });
    if (!t?.available || aiLocked || !state.auth) return;
    todayTipData = t;
    $('#todayTipText').textContent = t.text;
    $('#todayTipSrc').textContent = (t.source ? '출처: ' + t.source + ' · ' : '') + '내가 찾아본 포인트 기준';
    $('#todayTipVoice').hidden = !(t.voice && t.speechId); $('#todayTipVoice').textContent = '🔊 듣기'; $('#todayTipVoice').disabled = false;
    $('#todayTipMore').hidden = !t.actions?.length;
    if (todayAudioUrl) { URL.revokeObjectURL(todayAudioUrl); todayAudioUrl = null; todayAudio = null; }
    $('#todayTip').hidden = false;
  } catch { /* 부가 기능: 실패하면 보이지 않음 */ }
}
$('#todayTipClose').onclick = hideTodayTip;
$('#todayTipNearby').onclick = () => { hideTodayTip(); showTab('chat'); showNearby(true); };
$('#todayTipMore').onclick = () => { const a = todayTipData?.actions?.[0]; hideTodayTip(); if (a) send(a.message, { pointId: a.pointId, date: a.date }); };
$('#todayTipVoice').onclick = async () => {
  const b = $('#todayTipVoice');
  if (todayAudio && !todayAudio.paused) { todayAudio.pause(); todayAudio.currentTime = 0; b.textContent = '🔊 듣기'; return; }
  if (!todayAudio) {
    b.disabled = true; b.textContent = '불러오는 중…';
    try {
      const r = await fetch(state.api + '/v1/tts/' + todayTipData.speechId, { headers: { Authorization: 'Bearer ' + state.auth.token }, signal: AbortSignal.timeout(40000) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || '음성을 불러오지 못했어요'); }
      todayAudioUrl = URL.createObjectURL(await r.blob()); todayAudio = new Audio(todayAudioUrl);
      todayAudio.onended = () => { b.textContent = '🔊 다시 듣기'; };
    } catch (e) { b.disabled = false; b.textContent = '🔊 듣기'; toast(e.message); return; }
    b.disabled = false;
  }
  try { await todayAudio.play(); b.textContent = '⏹ 멈추기'; } catch { b.textContent = '🔊 듣기'; toast('소리를 재생하지 못했어요. 무음 모드인지 확인해 주세요.'); }
};

// 장기기억(내가 자주 찾은 포인트) 기반 이번 주말 출조 제안. 히스토리가 없으면 아무것도 보이지 않는다.
async function suggestWeekend() {
  try {
    const s = await api('/v1/suggest', { timeoutMs: 20000 });
    if (!s?.available || aiLocked || !state.auth) return;
    const d = bubble('bot suggest', md('**📌 이번 주말 출조 제안**\n' + s.text) + (s.sources?.length ? '<div class="suggest-src">출처: ' + esc(s.sources.join(' · ')) + ' · 내 이용 기록 기준 추천</div>' : ''));
    if (s.actions?.length) renderMessage({ type: 'actions', buttons: s.actions });
    return d;
  } catch { /* 제안은 부가 기능: 실패해도 대화는 그대로 */ }
}
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
  hideTodayTip(); todayTipData = null;
  origins = []; clearTimeout(originNudgeTimer); hideOriginTip(); $('#originBar').hidden = true; if ($('#originDialog').open) $('#originDialog').close();
  clearAiLock();
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
      onExpire: () => { const min = sessionMinutes(); endSession(`${min}분 이용 시간이 끝나 로그아웃했어요.`, false, 'expired'); showSessionEnd(min); }
    });
    const u = state.auth.user;
    bubble('bot', md(`**${u.displayName}**님, 반가워요. 이번 로그인은 **${sessionMinutes()}분** 동안 이용할 수 있어요.`));
    refreshUsage();
    suggestWeekend();
    // 하루 한 번 추천 말풍선(대화 기록 → 없으면 출발지 주변). 출발지가 없으면 등록 독려 말풍선이 함께 뜬다
    loadOrigins().then(() => showDailyTip());
    recordLoginLocation();
    clearInterval(window.__usageSync); window.__usageSync = setInterval(() => { if (state.auth) refreshUsage(); }, 60000);
  }
  welcome(); restore();
}
async function refreshUsage() {
  try {
    const me = await api('/v1/auth/me', { timeoutMs: 10000 });
    syncExpiry(me.remainingSec);
    renderUsage({ session: { messages: me.session.messages, limit: me.limits.sessionMessages }, today: { messages: me.usage.today.messages, limit: me.limits.dailyMessages } });
    applyAiLock(me.ai);
  } catch { /* 401 은 자동 로그아웃 처리 */ }
}
let ending = false;
function endSession(msg, ok = false, reason = 'logout') {
  if (ending) return; ending = true;
  logout(reason); timer?.stop(); timer = null; toast(''); usageText = '';
  chat.innerHTML = ''; $('#brief').innerHTML = '<p class="empty">포인트를 고르면 상세 브리핑이 여기에 표시됩니다.</p>'; slots = {}; renderChips();
  showLogin(msg, ok); ending = false;
}
function showSessionEnd(min) {
  // 이용 시간 만료 안내창: 로그아웃은 이미 끝났고, 확인을 누르면 로그인 화면에 그대로 머문다
  showNotice('오늘 이용 시간이 끝났습니다', `오늘 하루 이용 시간은 로그인 1회당 ${min}분입니다.\n이용해 주셔서 감사합니다. 내일 다시 찾아 주세요.`);
}
function showNotice(title, msg) {
  const d = $('#sessionEndDialog'); if (!d || d.open) return;
  $('#sessionEndTitle').textContent = title; $('#sessionEndMsg').textContent = msg;
  try { d.showModal(); } catch { /* 안내창을 못 띄워도 로그인 화면 문구로 안내됨 */ }
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
    if (r.user.mustChangePassword) openPw(true); else enterApp();
  } catch (err) {
    if (err.code === 'ACTIVE_SESSION') {
      // 다른 기기 이용 중: 안내창 → 확인 시 로그인되지 않은 상태로 로그인 화면에 머문다
      $('#loginPw').value = ''; saveAuth(null);
      $('#activeSessionMsg').textContent = err.message;
      const d = $('#activeSessionDialog');
      d.onclose = () => { $('#loginMsg').textContent = ''; $('#loginId').focus(); };
      d.showModal();
    } else $('#loginMsg').textContent = err.message;
  }
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
  api('/v1/auth/me', { timeoutMs: 10000 }).then(me => applyAiLock(me.ai)).catch(() => {});
}

renderChips(); boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
