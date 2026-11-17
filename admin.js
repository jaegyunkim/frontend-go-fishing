import { approvalMailto } from './approval-email.js?v=1.16.3';
// 어디물어 관리자 화면: 계정·세션·사용량·대화 로그·로그인/작업 기록. 관리자 계정으로 로그인한 탭에서만 동작.
import { state, api, health, startTimer, syncExpiry, setOnAuthLost, logout } from './auth.js?v=1.16.3';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = v => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const n = v => Number(v ?? 0).toLocaleString('ko-KR');
const view = $('#view');
let current = 'users';

function note(text, bad = false) { const m = $('#msg'); m.textContent = text; m.hidden = !text; m.style.color = bad ? 'var(--bad)' : ''; if (text) setTimeout(() => { if (m.textContent === text) m.hidden = true; }, 8000); }
function gone(msg) { $('#userPageLink').hidden = true; view.innerHTML = `<div class="card"><h3>관리자 로그인이 필요합니다</h3><p class="sub">${esc(msg)}</p><p><a class="link-btn" href="./">채팅 화면에서 관리자 계정으로 로그인 →</a></p></div>`; $('#timer').hidden = true; }
setOnAuthLost(msg => { logout(); gone(msg); });

const dialog = (html, onSubmit) => new Promise(resolve => {
  const f = $('#dlgForm'); f.innerHTML = html + '<div class="row"><button value="ok">확인</button><button value="cancel" class="ghost" formnovalidate>취소</button></div>';
  $('#dlg').onclose = async () => { if ($('#dlg').returnValue === 'ok' && onSubmit) resolve(await onSubmit(new FormData(f))); else resolve(null); };
  $('#dlg').showModal();
});
const showSecret = async (title, pw, approvalEmail = null) => {
 const pending=dialog('<h2>'+esc(title)+'</h2><p class="hint">임시 비밀번호는 이 창에서만 확인할 수 있습니다. 신청자에게 안전하게 전달해 주십시오. 첫 로그인에 비밀번호를 변경해야 합니다.</p><p class="access-url"><span>모바일 접속 주소</span><a id="accessUrl" target="_blank" rel="noopener noreferrer"></a></p><input id="issuedSecret" type="password" readonly autocomplete="off"><div class="row secret-actions"><button id="revealSecret" type="button">비밀번호 보기</button>'+(approvalEmail?'<button id="sendApprovalEmail" type="button" class="ghost">메일 보내기</button></div><p id="approvalMailStatus" class="hint" role="status">기기의 기본 메일 앱에 받는 사람·제목·내용을 채웁니다. 메일 앱에서 확인 후 직접 보내 주십시오. 메일 앱이 설정되어 있어야 합니다.</p>':'</div>'));
 const accessUrl=window.GOFISHING_PUBLIC_URL||new URL('./',location.href).href; $('#accessUrl').href=accessUrl; $('#accessUrl').textContent=accessUrl; $('#issuedSecret').value=pw; $('#revealSecret').onclick=()=>{const x=$('#issuedSecret');x.type=x.type==='password'?'text':'password';$('#revealSecret').textContent=x.type==='password'?'비밀번호 보기':'비밀번호 숨기기';};
 if (approvalEmail) $('#sendApprovalEmail').onclick = () => {
   try {
     const mailto = approvalMailto(approvalEmail, pw);
     window.location.href = mailto;
     $('#approvalMailStatus').textContent = '메일 앱에서 받는 사람과 내용을 확인한 뒤 직접 보내 주십시오. 앱이 열리지 않으면 기기의 기본 메일 앱 설정을 확인해 주십시오.';
   } catch {
     $('#approvalMailStatus').textContent = '메일 앱을 열지 못했습니다. 신청자 이메일과 기기의 기본 메일 앱 설정을 확인해 주십시오.';
   }
 };
 await pending;$('#dlgForm').replaceChildren();
};

// ---- AI 연결(제공사·엔드포인트·API 키·모델) ----
let llmState = null;
async function renderLlm() {
  const box = $('#llmCard'); if (!box) return;
  const { config, status } = await api('/v1/admin/llm'); llmState = config;
  const cur = config.active ? config.providers[config.active] : null;
  box.innerHTML = '<h2>AI 연결</h2>'
    + '<p>현재 사용 중: ' + (cur ? '<b>' + esc(cur.label) + '</b> · ' + esc(cur.model || '모델 미지정') : '<span class="pill bad">미설정</span>') + '</p>'
    + '<p class="sub">' + esc(status.purpose) + '<br>최근 호출: ' + esc(status.last ? status.last.status + (status.last.model ? ' · ' + status.last.model : '') + (status.last.ms ? ' · ' + status.last.ms + 'ms' : '') : '재시작 이후 호출 없음') + '</p>'
    + '<form id="llmForm" class="llm-form" autocomplete="off">'
    + '<label>제공사<select name="provider">' + Object.entries(config.providers).map(([id, p]) => '<option value="' + id + '"' + (id === (config.active || 'openai') ? ' selected' : '') + '>' + esc(p.label) + (p.hasKey ? '' : ' (키 없음)') + '</option>').join('') + '</select></label>'
    + '<label>엔드포인트<input name="endpoint" type="url" inputmode="url" required spellcheck="false" autocapitalize="none"></label>'
    + '<div class="llm-row"><button type="button" id="llmDefault" class="ghost-btn">기본 주소로</button></div>'
    + '<label>API 키<input name="apiKey" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="none"></label>'
    + '<div class="llm-row"><button type="button" id="llmKeyShow" class="ghost-btn">키 보기</button></div>'
    + '<label>모델<select name="model" required></select></label>'
    + '<p class="sub" id="llmModelNote"></p>'
    + '<div class="llm-row"><button type="button" id="llmLoad" class="ghost-btn">모델 목록 불러오기</button></div>'
    + '<button type="submit" id="llmSave">연결 테스트 후 저장</button>'
    + '<p class="sub">저장 전에 실제 호출로 연결을 확인하고, 실패하면 저장하지 않습니다. 키는 서버에만 보관되고 화면에는 끝 4자리만 보입니다. 엔드포인트 주소를 다른 곳으로 바꿀 때는 키를 다시 입력해야 합니다.</p>'
    + '</form>';
  const f = $('#llmForm'), sel = f.provider, ep = f.endpoint, key = f.apiKey, model = f.model, note = $('#llmModelNote');
  const fillModels = (list, keep) => { model.innerHTML = list.map(m => '<option' + (m === keep ? ' selected' : '') + '>' + esc(m) + '</option>').join(''); if (keep && !list.includes(keep)) model.insertAdjacentHTML('afterbegin', '<option selected>' + esc(keep) + '</option>'); };
  const load = async () => {
    note.textContent = '모델 목록을 불러오는 중…'; $('#llmLoad').disabled = true;
    try { const r = await api('/v1/admin/llm/models', { method: 'POST', body: JSON.stringify({ provider: sel.value, endpoint: ep.value, apiKey: key.value || undefined }) });
      fillModels(r.models, model.value || config.providers[sel.value].model);
      note.textContent = (r.source === 'live' ? '키로 조회한 실시간 목록' : 'MonoRouter 화면 기준 목록') + ' · 대화용 ' + r.models.length + '개' + (r.note ? ' · ' + r.note : '');
    } catch (e) { note.textContent = e.message; } finally { $('#llmLoad').disabled = false; }
  };
  const pick = () => {
    const p = config.providers[sel.value]; ep.value = p.endpoint; key.value = '';
    key.placeholder = p.hasKey ? '저장된 키 ' + p.keyHint + ' · 바꿀 때만 입력' : sel.value === 'openai' ? 'mr_openai_… 키 입력' : sel.value === 'anthropic' ? 'mr_anthropic_… 키 입력' : 'mr_gemini_… 키 입력';
    fillModels(p.model ? [p.model] : [], p.model);
    load();
  };
  sel.onchange = pick; $('#llmLoad').onclick = load;
  $('#llmDefault').onclick = () => { ep.value = config.providers[sel.value].defaultEndpoint; };
  $('#llmKeyShow').onclick = () => { key.type = key.type === 'password' ? 'text' : 'password'; $('#llmKeyShow').textContent = key.type === 'password' ? '키 보기' : '키 숨기기'; };
  f.onsubmit = async e => {
    e.preventDefault(); const b = $('#llmSave'); b.disabled = true; b.textContent = '연결 테스트 중…';
    try { const r = await api('/v1/admin/llm', { method: 'POST', body: JSON.stringify({ provider: sel.value, endpoint: ep.value, apiKey: key.value || undefined, model: model.value }) });
      key.value = ''; note.textContent = '';
      noteTop('저장했습니다 · ' + r.config.providers[sel.value].label + ' · ' + r.test.model + ' (테스트 ' + r.test.ms + 'ms)');
      renderLlm();
    } catch (err) { noteTop(err.message, true); b.disabled = false; b.textContent = '연결 테스트 후 저장'; }
  };
  pick();
}
const noteTop = (t, bad) => note(t, bad);
const ROLE_LABEL = { admin: '관리자', tester: '내부 테스터', user: '베타 테스터' };
const roleText = r => ROLE_LABEL[r] ?? r;
const views = {
 async requests(){
 const {requests,capacity}=await api('/v1/admin/registrations');
 view.innerHTML='<div class="tool"><h2>가입 신청 · 승인</h2></div>'+capBar(capacity)+'<p class="sub">승인 즉시 랜덤 임시 비밀번호가 발급됩니다. 승인 완료 창의 메일 보내기로 신청자에게 안내해 주십시오. 메일 앱에서 직접 발송해야 합니다.</p><div class="requestCards">'+requests.map(r=>'<article class="card"><h3>'+esc(r.login_id)+' · '+esc(r.display_name)+'</h3><p class="sub">'+dt(r.created_at)+' · '+esc({pending:'승인 대기',approved:'승인 완료',rejected:'거절'}[r.status])+'</p>'+(r.reapply_count?'<p><span class="pill warn">재신청 '+n(r.reapply_count)+'회</span> <span class="sub">'+(r.last_rejected_at?dt(r.last_rejected_at)+'에 거절했던 신청':'이전에 거절했던 신청')+'</span></p>':'')+(r.status==='pending'?'<div class="acts"><button data-review="approve" data-id="'+r.id+'">승인·비밀번호 발급</button><button data-review="reject" data-id="'+r.id+'">거절</button></div>':'')+'</article>').join('')+'</div>';
 if(!requests.length)view.innerHTML+='<p>접수된 신청이 없습니다.</p>';
 view.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{if(!confirm(b.dataset.review==='approve'?'이 사용자를 승인하겠습니까?':'이 신청을 거절하겠습니까?'))return;b.disabled=true;try{const out=await api('/v1/admin/registrations/'+b.dataset.id+'/review',{method:'POST',body:JSON.stringify({action:b.dataset.review})});if(out.tempPassword)await showSecret(out.user.loginId+' 승인 완료',out.tempPassword,out.user.loginId);await views.requests();}catch(e){note(e.message,true);b.disabled=false;}});
 },
 async model(){const {llm,credits,ai}=await api('/v1/admin/model');
 view.innerHTML='<div class="card"><h2>서비스 상태</h2><p><span class="pill '+(ai.available?'ok':'bad')+'">'+(ai.available?'이용 가능':'이용 중지(크레딧 소진)')+'</span></p>'+(ai.available?'':'<p class="sub">사유: '+esc(ai.reason||'')+(ai.since?' · '+dt(ai.since)+'부터':'')+'</p><p class="sub">베타 테스터 화면은 모든 입력이 잠기고 안내 문구가 표시됩니다.</p>')+'<p class="sub">잔여 크레딧이 '+n(ai.threshold)+' 이하이거나 GPT가 크레딧 부족으로 응답을 거부하면 자동으로 이용을 멈춥니다.</p><div class="acts"><button id="aiRecheck">GPT 다시 확인·재개</button></div></div>'
  +'<div class="card" id="llmCard"><h2>AI 연결</h2><p class="sub">불러오는 중…</p></div>'
 +'<div class="card"><h2>MonoGPT 잔여 크레딧</h2><p>'+n(credits.remaining)+' / '+n(credits.total)+'</p><p class="sub">'+dt(credits.checkedAt)+' 확인 · '+esc(credits.source||'')+' · 실시간 아님</p><a href="https://monogpt.kr/apps/mono-router" target="_blank" rel="noopener noreferrer">MonoGPT에서 최신 잔액 확인</a><form id="creditForm" class="grid2" style="margin-top:10px"><label>잔여 크레딧<input name="remaining" type="number" min="0" required value="'+(credits.remaining??'')+'"></label><label>전체 크레딧<input name="total" type="number" min="1" required value="'+(credits.total??'')+'"></label><button>확인한 잔액 저장</button></form></div>';
 $('#creditForm').onsubmit=async ev=>{ev.preventDefault();try{const fd=Object.fromEntries(new FormData(ev.target));await api('/v1/admin/model/credit',{method:'POST',body:JSON.stringify(fd)});note('잔액을 저장했습니다');views.model();}catch(err){note(err.message,true);}};
 $('#aiRecheck').onclick=async()=>{const b=$('#aiRecheck');b.disabled=true;b.textContent='확인 중…';try{const r=await api('/v1/admin/model/recheck',{method:'POST',body:'{}'});note(r.ai.available?'GPT 호출 정상 · 서비스 이용 가능':'아직 이용할 수 없습니다: '+(r.ai.reason||r.call.reason||r.call.status),!r.ai.available);views.model();}catch(err){note(err.message,true);b.disabled=false;b.textContent='GPT 다시 확인·재개';}};
 renderLlm();
 },
  async users() {
    const [{ users }, { capacity }] = await Promise.all([api('/v1/admin/users'), api('/v1/admin/capacity')]);
    view.innerHTML = `<div class="tool"><h2>사용자 ${users.length}명</h2><div class="acts"><button id="add">+ 계정 발급</button></div></div>${capBar(capacity)}
    <div class="scroll"><table class="tbl"><tr><th>아이디·이름</th><th>역할·상태</th><th class="num">오늘 질문</th><th class="num">오늘 토큰</th><th class="num">로그인</th><th>세션 한도</th><th>기기·최근 로그인</th><th>작업</th></tr>
    ${users.map(u => `<tr><td><b>${esc(u.loginId)}</b><br><span class="sub">${esc(u.displayName)}${u.memo ? ' · ' + esc(u.memo) : ''}</span><br><button class="mini-btn" data-detail="opinions" data-id="${u.id}" data-login="${esc(u.loginId)}"${u.opinionCount ? '' : ' disabled title="보낸 의견이 없습니다"'}>의견 ${n(u.opinionCount)}</button></td>
      <td>${roleText(u.role)} <span class="sub">${u.role === 'user' ? '· 1기기' : '· 동시 접속 허용'}</span><br><span class="pill ${u.status === 'active' ? 'ok' : 'bad'}">${u.status === 'active' ? '사용' : '중지'}</span>${u.lockedUntil && new Date(u.lockedUntil) > new Date() ? ' <span class="pill warn">잠김</span>' : ''}${u.activeSessions ? ' <span class="pill ok">접속 중</span>' : ''}${u.mustChangePassword ? ' <span class="pill warn">비번 변경 대기</span>' : ''}</td>
      <td class="num">${n(u.today.messages)}/${n(u.limits.dailyMessages)}${u.today.blocked ? `<br><span class="sub">거절 ${u.today.blocked}</span>` : ''}<br><button class="mini-btn" data-detail="questions" data-id="${u.id}" data-login="${esc(u.loginId)}">질문</button></td><td class="num">${n(u.today.tokens)}/${n(u.limits.dailyTokens)}<br><button class="mini-btn" data-detail="usage" data-id="${u.id}" data-login="${esc(u.loginId)}">토큰</button></td>
      <td class="num">${n(u.today.sessions)}<br><span class="sub">${u.role === "user" ? "24시간 1회" : "제한 없음"}</span></td><td>${u.limits.sessionMinutes}분 · 질문 ${u.limits.sessionMessages}</td><td>${esc(u.device?.platform)}<br>${esc(u.device?.browser)}<br>${dt(u.lastLoginAt)}${u.nextLoginAt?`<br><span class="sub">재이용 ${dt(u.nextLoginAt)}</span>`:""}<br><button class="mini-btn" data-detail="logins" data-id="${u.id}" data-login="${esc(u.loginId)}">위치</button></td>
      <td><div class="acts" data-id="${u.id}" data-login="${esc(u.loginId)}"><button data-a="limits">한도</button><button data-a="role">권한</button><button data-a="reset">비번 초기화</button>${u.lockedUntil ? '<button data-a="unlock">잠금 해제</button>' : ''}
        <button data-a="toggle" class="${u.status === 'active' ? 'danger' : ''}">${u.status === 'active' ? '중지' : '재개'}</button><button data-a="chats">대화</button></div></td></tr>`).join('')}</table></div>`;
    view.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => go(b.dataset.detail === 'opinions' ? 'opinions' : 'user_' + b.dataset.detail, { user: b.dataset.id, label: b.dataset.login }));
    $('#add').onclick = async () => {
      const r = await dialog(`<h2>계정 발급</h2><label>아이디 (베타 테스터는 이메일, 관리자·내부 테스터는 영문 아이디도 가능)<input name="loginId" required maxlength="254"></label><label>이름<input name="displayName" required maxlength="40"></label>
        <label>역할<select name="role"><option value="user">일반 (한 기기만)</option><option value="tester">내부 테스터 (동시 접속 허용)</option><option value="admin">관리자 (동시 접속 허용)</option></select></label><label>메모<input name="memo" maxlength="100"></label>
        <p class="hint">한도 기본값: 베타 테스터: 세션 10분 고정·24시간에 1회 로그인, 세션당 질문 10·하루 질문 10·토큰 1,000. 정원: 베타 테스터 100명·하루 신청 100건·하루 로그인 100명(관리자·내부 테스터 예외). 발급 후 '한도'에서 바꿀 수 있습니다.</p>`,
        fd => api('/v1/admin/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) }).catch(e => ({ error: e.message })));
      if (r?.error) return note(r.error, true);
      if (r?.user?.tempPassword) await showSecret(`${r.user.loginId} 계정을 만들었습니다`, r.user.tempPassword);
      views.users();
    };
    view.querySelectorAll('.acts[data-id] button').forEach(b => b.onclick = async () => {
      const box = b.parentElement, id = box.dataset.id, login = box.dataset.login, u = users.find(x => String(x.id) === id);
      const patch = body => api(`/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      try {
        if (b.dataset.a === 'limits') {
          const L = u.limits;
          const r = await dialog(`<h2>${esc(login)} 한도</h2><div class="grid2">
            <label>세션 시간(분)<input name="sessionMinutes" type="number" min="1" max="120" value="${L.sessionMinutes}" ${u.role === "admin" ? "" : "disabled"}></label><label>세션당 질문<input name="sessionMessages" type="number" min="1" value="${L.sessionMessages}"></label>
            <label>하루 질문<input name="dailyMessages" type="number" min="1" value="${L.dailyMessages}"></label><label>하루 로그인<input name="dailySessions" type="number" min="1" value="${L.dailySessions}" disabled></label>
            <label>하루 AI 토큰<input name="dailyTokens" type="number" min="0" value="${L.dailyTokens}"></label></div><p class="hint">질문·토큰 한도는 저장 즉시 적용됩니다. 관리자 계정의 세션 시간은 이용 중인 세션에도 바로 반영됩니다(로그인 시각 기준). 베타 테스터는 10분·24시간 1회 고정입니다.</p>`,
          fd => patch(Object.fromEntries([...fd].map(([k, v]) => [k, Number(v)]))));
          if (r) { note(`${login} 한도를 저장했습니다 · 즉시 적용${r.adjustedSessions ? ` (이용 중인 세션 ${r.adjustedSessions}개 시간 변경)` : ''}`); if (String(id) === String(state.auth?.user?.id)) { const me = await api('/v1/auth/me'); syncExpiry(me.remainingSec); $('#who').textContent = `${me.user.displayName}(${me.user.loginId}) · 세션 ${me.limits.sessionMinutes}분`; } }
        } else if (b.dataset.a === 'role') {
          const r = await dialog(`<h2>${esc(login)} 권한</h2><label>역할<select name="role">${['user', 'tester', 'admin'].map(x => `<option value="${x}"${x === u.role ? ' selected' : ''}>${roleText(x)}</option>`).join('')}</select></label>
            <p class="hint">베타 테스터: 한 기기에서만 로그인 · 내부 테스터·관리자: 여러 기기 동시 접속 허용 · 관리자만 이 관리자 페이지를 쓸 수 있습니다.<br>권한을 바꾸면 이 계정의 이용 중인 세션은 종료되고, 다시 로그인할 때 새 권한이 적용됩니다.</p>`,
            fd => patch({ role: fd.get('role') }).catch(e => ({ error: e.message })));
          if (r?.error) return note(r.error, true);
          if (r) note(`${login} 권한: ${roleText(r.user.role)}`);
        } else if (b.dataset.a === 'reset') {
          if (!confirm(`${login} 비밀번호를 초기화하겠습니까? 접속 중인 세션도 종료됩니다.`)) return;
          const r = await patch({ resetPassword: true, unlock: true }); await showSecret(`${login} 비밀번호를 초기화했습니다`, r.tempPassword);
        } else if (b.dataset.a === 'unlock') { await patch({ unlock: true }); note('잠금을 풀었습니다'); }
        else if (b.dataset.a === 'toggle') {
          const off = u.status === 'active';
          if (off && !confirm(`${login} 계정을 중지하겠습니까? 접속 중인 세션도 즉시 종료됩니다.`)) return;
          await patch({ status: off ? 'disabled' : 'active' }); note(`${login}: ${off ? '중지' : '재개'}`);
        } else if (b.dataset.a === 'chats') return go('chats', { user: id, label: login });
        views.users();
      } catch (e) { note(e.message, true); }
    });
  },
  async sessions(opt = {}) {
    const all = opt.all ? '?all=1' : '';
    const { sessions } = await api('/v1/admin/sessions' + all);
    view.innerHTML = `<div class="tool"><h2>${opt.all ? '최근 세션' : '접속 중인 세션'} ${sessions.length}</h2><div class="acts"><button id="tg">${opt.all ? '접속 중만' : '최근 전체 보기'}</button><button id="rf">새로고침</button></div></div>
    <div class="scroll"><table class="tbl"><tr><th>사용자</th><th>시작</th><th>남은 시간·종료</th><th class="num">질문</th><th class="num">AI 호출·토큰</th><th>외부 API 호출</th><th>작업</th></tr>
    ${sessions.map(s => { const left = Math.max(0, Math.round((new Date(s.expires_at) - Date.now()) / 1000));
      const end = s.active ? `<span class="pill ok">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>` : `${dt(s.ended_at)}<br><span class="sub">${esc({ logout: '로그아웃', expired: '시간 만료', revoked: '강제 종료', replaced: '새 로그인', disabled: '계정 중지' }[s.end_reason] ?? s.end_reason ?? '만료')}</span>`;
      const apis = Object.entries(s.api_calls || {}).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '-';
      return `<tr><td><b>${esc(s.login_id)}</b><br><span class="sub">${esc(s.display_name)} · ${esc(s.device?.platform ?? s.client ?? '')} · ${esc(s.device?.browser ?? '')}</span></td><td>${dt(s.created_at)}</td><td>${end}</td><td class="num">${n(s.message_count)}</td>
        <td class="num">${n(s.llm_calls)} · ${n(s.tokens_in + s.tokens_out)}</td><td class="sub">${apis}</td>
        <td><div class="acts"><button data-chat="${s.id}" data-label="${esc(s.login_id)}">대화</button>${s.active ? `<button class="danger" data-revoke="${s.id}">강제 종료</button>` : ''}</div></td></tr>`; }).join('')}</table></div>`;
    $('#tg').onclick = () => views.sessions({ all: !opt.all }); $('#rf').onclick = () => views.sessions(opt);
    view.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('이 세션을 강제 종료하겠습니까?')) return; await api(`/v1/admin/sessions/${b.dataset.revoke}/revoke`, { method: 'POST', body: '{}' }); note('세션을 종료했습니다'); views.sessions(opt); });
    view.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => go('chats', { session: b.dataset.chat, label: b.dataset.label }));
  },
  async usage() {
    const { usage } = await api('/v1/admin/usage?days=14');
    const tot = usage.reduce((a, r) => ({ m: a.m + r.messages, t: a.t + r.tokens_in + r.tokens_out, s: a.s + r.sessions, b: a.b + r.blocked }), { m: 0, t: 0, s: 0, b: 0 });
    view.innerHTML = `<div class="tool"><h2>최근 14일 사용량</h2><span class="sub">로그인 ${n(tot.s)} · 질문 ${n(tot.m)} · AI 토큰 ${n(tot.t)} · 한도 거절 ${n(tot.b)}</span></div>
    <div class="scroll"><table class="tbl"><tr><th>날짜</th><th>사용자</th><th class="num">로그인</th><th class="num">질문</th><th class="num">AI 호출</th><th class="num">토큰(입력/출력)</th><th class="num">거절</th><th>외부 API 호출</th></tr>
    ${usage.map(r => `<tr><td>${String(r.day).slice(0, 10)}</td><td>${esc(r.login_id)}</td><td class="num">${n(r.sessions)}</td><td class="num">${n(r.messages)}</td><td class="num">${n(r.llm_calls)}</td>
      <td class="num">${n(r.tokens_in)}/${n(r.tokens_out)}</td><td class="num">${n(r.blocked)}</td><td class="sub">${Object.entries(r.api_calls || {}).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '-'}</td></tr>`).join('')}</table></div>`;
  },
  async chats(opt = {}) {
    if (!opt.session && !opt.user) { view.innerHTML = '<div class="card"><p class="sub">세션 탭이나 사용자 탭에서 "대화"를 눌러 열람할 대화를 고르십시오.</p></div>'; return; }
    const qs = opt.session ? `session=${opt.session}` : `user=${opt.user}`;
    const { messages } = await api(`/v1/admin/chats?${qs}&limit=300`);
    view.innerHTML = `<div class="tool"><h2>대화 로그 · ${esc(opt.label ?? '')}</h2><span class="sub">${messages.length}건 · 주소 번지는 저장 시 가려짐 · 보관 30일</span></div>
    <div class="chatlog">${messages.map(m => `<div class="m ${m.role}">${esc(m.content).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}<div class="meta">${dt(m.created_at)} · ${esc(m.login_id ?? '')} · ${esc(m.intent ?? '')}${m.latency_ms ? ` · ${m.latency_ms}ms` : ''}${m.tokens_in ? ` · 토큰 ${m.tokens_in}/${m.tokens_out}` : ''}</div></div>`).join('') || '<p class="sub">대화 없음</p>'}</div>`;
  },
  async logins() {
    const { logins } = await api('/v1/admin/logins');
    view.innerHTML = `<div class="tool"><h2>로그인 기록(최근 200)</h2></div><div class="scroll"><table class="tbl"><tr><th>시각</th><th>아이디</th><th>결과</th><th>기기</th></tr>
    ${logins.map(l => `<tr><td>${dt(l.at)}</td><td>${esc(l.login_id)}</td><td><span class="pill ${l.success ? 'ok' : 'bad'}">${l.success ? '성공' : '실패'}</span> <span class="sub">${esc(l.reason ?? '')}</span></td><td class="sub">${esc((l.user_agent ?? '').slice(0, 60))}</td></tr>`).join('')}</table></div>`;
  },
  async reports() {
    const { reports } = await api('/v1/admin/reports?limit=90');
    const ST = { ok: '<span class="pill ok">정상</span>', warn: '<span class="pill warn">주의</span>', critical: '<span class="pill bad">위험</span>' };
    view.innerHTML = `<div class="tool"><h2>서버 운영 리포트</h2><div class="acts"><button id="genReport">오늘 리포트 지금 만들기</button></div></div>
    <p class="sub">매일 00:10(한국 시간)에 전날 리포트를 자동으로 만들고 Slack 로그 채널에 요약을 보냅니다. 수동 생성은 오늘 0시부터 지금까지를 집계합니다. 리포트는 2년, 시간별 지표는 180일 보관합니다.</p>
    ${reports.length ? `<div class="rep-list">${reports.map(r => `<button class="rep-item" data-date="${esc(r.date)}"><div class="rep-top"><b>${esc(r.date)}</b>${ST[r.status] ?? esc(r.status)}${r.alert_count ? `<span class="sub">경보 ${r.alert_count}</span>` : ''}<span class="sub">${r.trigger === 'auto' ? '자동' : '수동'} · ${dt(r.generated_at)}</span></div>
      <div class="rep-nums"><span>요청 <b>${n(r.requests)}</b></span><span>로그인 <b>${n(r.users)}</b>명</span><span>질문 <b>${n(r.questions)}</b></span></div></button>`).join('')}</div>` : '<div class="card"><p class="sub">아직 만들어진 리포트가 없습니다. 위 버튼으로 오늘 리포트를 만들어 보십시오.</p></div>'}`;
    $('#genReport').onclick = async () => { const b = $('#genReport'); b.disabled = true; b.textContent = '만드는 중…'; try { const { report } = await api('/v1/admin/reports/generate', { method: 'POST', body: '{}' }); go('report', { date: report.date }); } catch (e) { note(e.message, true); b.disabled = false; b.textContent = '오늘 리포트 지금 만들기'; } };
    view.querySelectorAll('[data-date]').forEach(b => b.onclick = () => go('report', { date: b.dataset.date }));
  },
  async report(opt = {}) {
    const { report: r } = await api(`/v1/admin/reports/${opt.date}`); const m = r.metrics, t = m.traffic, u = m.users, res = m.resources;
    const ST = { ok: ['정상', 'ok'], warn: ['주의', 'warn'], critical: ['위험', 'bad'] }[r.status] ?? [r.status, ''];
    const kv = rows => `<dl class="kv rep-kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const pctTxt = v => v == null ? '-' : (Math.round(v * 1000) / 10) + '%';
    const hours = Array.from({ length: 24 }, (_, i) => { const h = (t.hourly ?? []).find(x => Number(x.h) === i); return { i, n: h?.n ?? 0, e: h?.e ?? 0 }; }), hmax = Math.max(1, ...hours.map(h => h.n));
    view.innerHTML = `<div class="tool"><div class="acts"><button id="backReports">← 리포트 목록</button></div><h2>운영 리포트 · ${esc(r.date)} <span class="pill ${ST[1]}">${ST[0]}</span></h2></div>
    <p class="sub">${esc(r.summary)}<br>${r.trigger === 'auto' ? '자동' : '수동'} 생성 ${dt(r.generated_at)} · 집계 ${dt(r.period_start)} ~ ${dt(r.period_end)} · 백엔드 v${esc(r.version ?? '-')}</p>
    <div class="card"><h3>경보 ${r.alerts.length}건</h3>${r.alerts.length ? `<ul class="rep-alerts">${r.alerts.map(a => `<li class="${a.level}"><span class="pill ${a.level === 'critical' ? 'bad' : 'warn'}">${a.level === 'critical' ? '위험' : '주의'}</span> <b>${esc(a.area)}</b> ${esc(a.message)}</li>`).join('')}</ul>` : '<p class="sub">경보 없음 — 모든 지표가 기준 안에 있습니다.</p>'}</div>
    <div class="card"><h3>가용성·트래픽</h3>${kv([['서버 재시작', `${n(m.availability.restarts)}회`], ['요청', `${n(t.requests)}건 (가장 많은 시간 ${t.peakHour ? esc(t.peakHour.h) + '시 ' + n(t.peakHour.n) + '건' : '-'})`], ['오류', `서버 오류(5xx) ${n(t.errors5xx)}건 (${pctTxt(t.errorRate5xx)}) · 요청 오류(4xx) ${n(t.errors4xx)}건 · 요청 제한(429) ${n(t.rateLimited429)}건`], ['응답 시간', `평균 ${t.avgMs ?? '-'}ms · 95% ${t.p95Ms ?? '-'}ms 이하`], ['클라이언트 오류 보고', `${n(m.errors.clientReports)}건`]])}
      <div class="rep-hours" aria-label="시간별 요청">${hours.map(h => `<i title="${h.i}시 ${h.n}건" style="height:${Math.max(2, h.n / hmax * 100)}%" class="${h.e ? 'err' : ''}"></i>`).join('')}</div><div class="rep-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
      ${t.topRoutes?.length ? `<div class="scroll"><table class="tbl"><tr><th>많이 쓴 경로</th><th class="num">요청</th><th class="num">평균</th><th class="num">최대</th><th class="num">5xx</th></tr>${t.topRoutes.map(x => `<tr><td>${esc(x.route)}</td><td class="num">${n(x.requests)}</td><td class="num">${x.avgMs}ms</td><td class="num">${x.maxMs}ms</td><td class="num">${n(x.errors5xx)}</td></tr>`).join('')}</table></div>` : ''}</div>
    <div class="card"><h3>사용자·서비스</h3>${kv([['로그인', `성공 ${n(u.loginOk)} · 실패 ${n(u.loginFail)} · 이용자 ${n(u.activeUsers)}명`], ['신청·승인', `신청 ${n(u.registrations)} · 승인 ${n(u.approvals)} · 거절 ${n(u.rejections)}`], ['질문·AI', `질문 ${n(u.questions)} · AI 호출 ${n(u.llmCalls)} · 토큰 ${n(u.tokens)} · 한도 거절 ${n(u.blockedByLimit)}`], ['답변 시간', `평균 ${u.answer?.avgMs ?? '-'}ms · 95% ${u.answer?.p95Ms ?? '-'}ms (${n(u.answer?.count)}건)`], ['의견', `${n(u.opinions)}건${u.avgRating != null ? ` · 평균 ${u.avgRating}점` : ''}`],
      ['정원', `오늘 신청 ${u.capacity.registers.used}/${u.capacity.registers.max} · 베타 테스터 ${u.capacity.users.used}/${u.capacity.users.max} · 오늘 로그인 ${u.capacity.logins.used}/${u.capacity.logins.max}`]])}</div>
    <div class="card"><h3>외부 API 사용량</h3>${m.external.length ? `<div class="scroll"><table class="tbl"><tr><th>제공기관</th><th class="num">호출</th><th class="num">하루 한도</th><th>사용률</th><th class="num">오류</th></tr>${m.external.map(e => `<tr><td>${esc(e.provider)}</td><td class="num">${n(e.calls)}</td><td class="num">${e.quota ? n(e.quota) : '-'}</td><td>${e.usage != null ? `<div class="ubar"><i style="width:${Math.min(100, e.usage * 100).toFixed(1)}%"${e.usage >= 0.8 ? ' class="over"' : ''}></i></div><span class="sub">${pctTxt(e.usage)}</span>` : '-'}</td><td class="num">${n(e.errors)}</td></tr>`).join('')}</table></div><p class="sub">로그인 사용자 요청에서 실제로 호출한 수(캐시 적중 제외)</p>` : '<p class="sub">호출 기록 없음</p>'}</div>
    <div class="card"><h3>오류 로그</h3>${kv([['건수', `오류 ${n(m.errors.error)} · 경고 ${n(m.errors.warn)} · 정보 ${n(m.errors.info)}`]])}${m.errors.top.length ? `<ul class="qlist">${m.errors.top.map(e => `<li><span class="sub">${n(e.n)}회 · 마지막 ${dt(e.last)}</span><div>${esc(e.title)}</div></li>`).join('')}</ul>` : '<p class="sub">오류·경고 없음</p>'}</div>
    <div class="card"><h3>자원·백업 <span class="sub">(${dt(res.sampledAt)} 측정)</span></h3>${kv([['서버 프로세스', `가동 ${res.process.uptimeH}시간 · 메모리 ${res.process.rssMB}MB · Node ${esc(res.process.node)}`], ['호스트', `CPU ${res.host.cpus}개 · 부하 ${res.host.load.join(' / ')} · 메모리 ${res.host.memTotalGB}GB`],
      ['디스크', res.disk ? `남은 공간 ${res.disk.freeGB}GB / ${res.disk.totalGB}GB (${pctTxt(res.disk.freeRatio)})` : '-'], ['DB', `${res.db.sizeMB}MB · 큰 테이블 ${res.db.tables.slice(0, 3).map(x => `${esc(x.name)} ${x.sizeMB}MB`).join(', ')}`],
      ['백업', res.backup.latest ? `마지막 ${dt(res.backup.latest.at)} · ${esc(res.backup.latest.file)} (${res.backup.latest.sizeMB}MB)` : '<span class="st-error">백업 파일 없음</span>'], ['Notion 요약', res.notionSummary?.log ? esc(res.notionSummary.log) : '-']])}</div>
    <div class="card"><h3>AI</h3>${kv([['상태', m.ai.status?.available === false ? '<span class="pill bad">크레딧 소진 잠금</span>' : '<span class="pill ok">이용 가능</span>'], ['크레딧', m.ai.credit?.remaining != null ? `${n(m.ai.credit.remaining)} / ${n(m.ai.credit.total)} (${dt(m.ai.credit.checkedAt)} 확인값)` : '확인 기록 없음']])}</div>`;
    $('#backReports').onclick = () => go('reports');
  },
  async user_usage(opt = {}) {
    const { user, days } = await api(`/v1/admin/users/${opt.user}/usage?days=30`);
    const max = Math.max(user.dailyTokens || 0, ...days.map(d => d.tokens), 1), sum = days.reduce((a, d) => a + d.tokens, 0);
    view.innerHTML = `${backBar(`토큰 사용 기록 · ${esc(user.loginId)}`)}<p class="sub">최근 30일 · 합계 ${n(sum)} 토큰 · 하루 한도 ${n(user.dailyTokens)} · 사용이 없던 날은 빠집니다</p>
    ${days.length ? `<div class="scroll"><table class="tbl"><tr><th>날짜</th><th class="num">토큰(입력/출력)</th><th>한도 대비</th><th class="num">AI 호출</th><th class="num">질문</th><th class="num">로그인</th></tr>
    ${days.map(d => `<tr><td>${esc(d.day)}</td><td class="num"><b>${n(d.tokens)}</b><br><span class="sub">${n(d.tokensIn)} / ${n(d.tokensOut)}</span></td><td><div class="ubar"><i style="width:${Math.min(100, d.tokens / max * 100).toFixed(1)}%"${user.dailyTokens && d.tokens > user.dailyTokens ? ' class="over"' : ''}></i></div><span class="sub">${user.dailyTokens ? Math.round(d.tokens / user.dailyTokens * 100) + '%' : '-'}</span></td><td class="num">${n(d.llmCalls)}</td><td class="num">${n(d.messages)}${d.blocked ? `<br><span class="sub">거절 ${d.blocked}</span>` : ''}</td><td class="num">${n(d.sessions)}</td></tr>`).join('')}</table></div>` : '<div class="card"><p class="sub">최근 30일 사용 기록이 없습니다.</p></div>'}`;
    bindBack();
  },
  async user_questions(opt = {}) {
    const { user, days } = await api(`/v1/admin/users/${opt.user}/questions?days=30`);
    view.innerHTML = `${backBar(`질문 기록 · ${esc(user.loginId)}`)}<p class="sub">최근 30일 · 날짜별 질문 ${n(days.reduce((a, d) => a + d.count, 0))}건 · 주소 번지는 저장할 때 가려짐</p>
    ${days.length ? days.map((d, i) => `<details class="card qday"${i === 0 ? ' open' : ''}><summary><b>${esc(d.day)}</b> <span class="pill ok">질문 ${d.count}</span></summary><ul class="qlist">${d.items.map(m => `<li><span class="sub">${esc(new Date(m.at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }))}${m.intent ? ' · ' + esc(m.intent) : ''}</span><div>${esc(m.content)}</div></li>`).join('')}</ul></details>`).join('') : '<div class="card"><p class="sub">최근 30일 질문이 없습니다.</p></div>'}
    <div class="acts" style="margin-top:8px"><button id="toChats">답변까지 전체 대화 보기</button></div>`;
    bindBack(); $('#toChats').onclick = () => go('chats', { user: opt.user, label: user.loginId });
  },
  async user_logins(opt = {}) {
    const { user, logins } = await api(`/v1/admin/users/${opt.user}/logins?days=30`);
    const ST = { granted: '<span class="pill ok">허용</span>', denied: '<span class="pill warn">거부</span>', unavailable: '<span class="pill">확인 불가</span>', none: '<span class="sub">요청 전·이전 버전</span>' };
    view.innerHTML = `${backBar(`로그인 위치 기록 · ${esc(user.loginId)}`)}<p class="sub">최근 30일 로그인 · 위치는 사용자가 허용한 경우만 약 100m 단위로 저장하고 30일 뒤 지웁니다</p>
    ${logins.length ? `<div class="scroll"><table class="tbl"><tr><th>로그인</th><th>기기</th><th>위치 동의</th><th>위경도</th><th>지도</th></tr>
    ${logins.map(l => `<tr><td>${dt(l.at)}${l.endedAt ? `<br><span class="sub">종료 ${dt(l.endedAt)}${l.endReason ? ' · ' + esc(l.endReason) : ''}</span>` : ''}</td><td>${esc(l.device?.platform)}<br><span class="sub">${esc(l.device?.browser)}</span></td><td>${ST[l.locationStatus] ?? esc(l.locationStatus)}</td>
      <td>${l.location ? `${l.location.lat.toFixed(3)}, ${l.location.lon.toFixed(3)}${l.location.accuracyM ? `<br><span class="sub">오차 약 ${n(l.location.accuracyM)}m</span>` : ''}` : '-'}</td>
      <td>${l.location ? `<a href="https://map.kakao.com/link/map/${encodeURIComponent(user.loginId + ' 로그인')},${l.location.lat},${l.location.lon}" target="_blank" rel="noopener noreferrer">카카오맵</a>` : '-'}</td></tr>`).join('')}</table></div>` : '<div class="card"><p class="sub">최근 30일 로그인 기록이 없습니다.</p></div>'}`;
    bindBack();
  },
  async opinions(opt = {}) {
    const { opinions } = await api('/v1/admin/opinions' + (opt.user ? `?user=${opt.user}` : ''));
    const avg = opinions.filter(o => o.rating).map(o => o.rating);
    view.innerHTML = `${opt.user ? backBar(`의견 · ${esc(opt.label ?? '')}`) : '<div class="tool"><h2>의견 보내기(최근 200)</h2></div>'}<p class="sub">사용자가 하단 '의견' 탭에서 보낸 의견입니다. 새 의견은 Slack 18_gofishing_feedback 채널로도 알려 드립니다.${avg.length ? ` 평균 만족도 ${(avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1)}점(${avg.length}건)` : ''}</p>
    ${opinions.length ? `<div class="scroll"><table class="tbl"><tr><th>시각</th><th>아이디</th><th>만족도</th><th>의견</th></tr>
    ${opinions.map(o => `<tr><td>${dt(o.createdAt)}</td><td>${esc(o.loginId ?? '')}</td><td>${o.rating ? '★'.repeat(o.rating) + '☆'.repeat(5 - o.rating) : '<span class="sub">-</span>'}</td><td style="white-space:pre-wrap">${esc(o.text)}</td></tr>`).join('')}</table></div>` : '<div class="card"><p class="sub">아직 받은 의견이 없습니다.</p></div>'}`;
    bindBack();
  },
  async actions() {
    const { actions } = await api('/v1/admin/actions');
    view.innerHTML = `<div class="tool"><h2>관리자 작업 기록</h2></div><div class="scroll"><table class="tbl"><tr><th>시각</th><th>관리자</th><th>작업</th><th>대상</th><th>내용</th></tr>
    ${actions.map(a => `<tr><td>${dt(a.at)}</td><td>${esc(a.admin ?? 'CLI')}</td><td>${esc(a.action)}</td><td>${esc(a.target ?? '')}</td><td class="sub">${esc(JSON.stringify(a.detail ?? {}))}</td></tr>`).join('')}</table></div>`;
  }
};
const capBar = c => c ? `<div class="capbar">${[['오늘 신청', c.registers], ['베타 테스터', c.users], ['오늘 로그인', c.logins]].map(([l, v]) => `<div class="${v.used >= v.max ? 'full' : v.used >= v.max * 0.8 ? 'near' : ''}"><span>${l}</span><b>${n(v.used)} / ${n(v.max)}</b><i><em style="width:${Math.min(100, v.max ? v.used / v.max * 100 : 100).toFixed(1)}%"></em></i></div>`).join('')}</div><p class="sub">정원에 닿으면 새 신청·승인·로그인을 막습니다(관리자·내부 테스터 예외).</p>` : '';
const backBar = title => `<div class="tool"><div class="acts"><button id="backUsers">← 사용자</button></div><h2>${title}</h2></div>`;
function bindBack() { const b = $('#backUsers'); if (b) b.onclick = () => go('users'); }
async function go(v, opt) {
  current = v; document.querySelectorAll('#atabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  try { await views[v](opt); } catch (e) { if (e.status !== 401) view.innerHTML = `<div class="card"><p class="sub">${esc(e.message)}</p></div>`; }
}
document.querySelectorAll('#atabs button').forEach(b => b.onclick = () => go(b.dataset.v));
// 모바일 카드형 표: 각 칸에 머리글을 data-label 로 붙여, 좁은 화면에서 '머리글: 값' 카드로 보이게 한다(CSS).
function labelTables(root = view) {
  root.querySelectorAll('table.tbl').forEach(t => {
    const rows = [...t.rows]; const head = rows.find(r => r.querySelector('th')); if (!head) return;
    head.classList.add('thead-row');
    const labels = [...head.cells].map(c => c.textContent.trim());
    rows.forEach(r => { if (r === head) return; [...r.cells].forEach((c, i) => { if (c.hasAttribute('data-label')) return; c.setAttribute('data-label', labels[i] ?? ''); if (!labels[i]) c.classList.add('no-label'); const w = document.createElement('div'); w.className = 'cell'; while (c.firstChild) w.appendChild(c.firstChild); c.appendChild(w); }); });
  });
}
new MutationObserver(() => labelTables()).observe(view, { childList: true, subtree: true });

(async () => {
  const h = await health();
  if (h.error) return gone(`서버 연결 실패: ${h.error}`);
  if (state.authMode !== 'required') return gone('서버가 로그인 없이 동작 중입니다(AUTH_MODE=off). 관리자 기능은 로그인 모드에서만 씁니다.');
  if (!state.auth?.token) return gone('이 탭에 로그인 정보가 없습니다.');
  try {
    const me = await api('/v1/auth/me');
    if (me.role !== 'admin') return gone('관리자 계정이 아닙니다.');
    $('#userPageLink').hidden = false;
    syncExpiry(me.remainingSec);
    $('#who').textContent = `${me.user.displayName}(${me.user.loginId}) · 세션 ${me.limits.sessionMinutes}분`;
    startTimer($('#timer'), { onWarn: s => note(`약 ${s}초 뒤 자동 로그아웃됩니다`), onExpire: () => { logout('expired'); gone('이용 시간이 끝나 자동 로그아웃됐습니다.'); } });
    go('users');
  } catch (e) { if (e.status !== 401) gone(e.message); }
})();
