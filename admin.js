// 어디물어 관리자 화면: 계정·세션·사용량·대화 로그·로그인/작업 기록. 관리자 계정으로 로그인한 탭에서만 동작.
import { state, api, health, startTimer, syncExpiry, setOnAuthLost, logout } from './auth.js?v=1.3.0';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = v => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const n = v => Number(v ?? 0).toLocaleString('ko-KR');
const view = $('#view');
let current = 'users';

function note(text, bad = false) { const m = $('#msg'); m.textContent = text; m.hidden = !text; m.style.color = bad ? 'var(--bad)' : ''; if (text) setTimeout(() => { if (m.textContent === text) m.hidden = true; }, 8000); }
function gone(msg) { view.innerHTML = `<div class="card"><h3>관리자 로그인이 필요합니다</h3><p class="sub">${esc(msg)}</p><p><a class="link-btn" href="./">채팅 화면에서 관리자 계정으로 로그인 →</a></p></div>`; $('#timer').hidden = true; }
setOnAuthLost(msg => { logout(); gone(msg); });

const dialog = (html, onSubmit) => new Promise(resolve => {
  const f = $('#dlgForm'); f.innerHTML = html + '<div class="row"><button value="ok">확인</button><button value="cancel" class="ghost" formnovalidate>취소</button></div>';
  $('#dlg').onclose = async () => { if ($('#dlg').returnValue === 'ok' && onSubmit) resolve(await onSubmit(new FormData(f))); else resolve(null); };
  $('#dlg').showModal();
});
const showSecret = async (title, pw) => {
 const pending=dialog('<h2>'+esc(title)+'</h2><p class="hint">임시 비밀번호는 이 창에서만 확인할 수 있습니다. 안전한 DM으로 전달하세요. 첫 로그인에 변경해야 합니다.</p><input id="issuedSecret" type="password" readonly autocomplete="off"><button id="revealSecret" type="button">비밀번호 보기</button>');
 $('#issuedSecret').value=pw; $('#revealSecret').onclick=()=>{const x=$('#issuedSecret');x.type=x.type==='password'?'text':'password';$('#revealSecret').textContent=x.type==='password'?'비밀번호 보기':'비밀번호 숨기기';};
 await pending;$('#dlgForm').replaceChildren();
};

const views = {
 async requests(){
 const {requests}=await api('/v1/admin/registrations');
 view.innerHTML='<div class="tool"><h2>가입 신청 · 승인</h2></div><p class="sub">승인 즉시 랜덤 임시 비밀번호가 발급됩니다. 보기 버튼으로 확인 후 DM으로 전달하세요.</p><div class="requestCards">'+requests.map(r=>'<article class="card"><h3>'+esc(r.login_id)+' · '+esc(r.display_name)+'</h3><p>'+esc(r.contact)+'</p><p class="sub">'+dt(r.created_at)+' · '+esc({pending:'승인 대기',approved:'승인 완료',rejected:'거절'}[r.status])+'</p>'+(r.status==='pending'?'<div class="acts"><button data-review="approve" data-id="'+r.id+'">승인·비밀번호 발급</button><button data-review="reject" data-id="'+r.id+'">거절</button></div>':'')+'</article>').join('')+'</div>';
 if(!requests.length)view.innerHTML+='<p>접수된 신청이 없습니다.</p>';
 view.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{if(!confirm(b.dataset.review==='approve'?'이 사용자를 승인할까요?':'이 신청을 거절할까요?'))return;b.disabled=true;try{const out=await api('/v1/admin/registrations/'+b.dataset.id+'/review',{method:'POST',body:JSON.stringify({action:b.dataset.review})});if(out.tempPassword)await showSecret(out.user.loginId+' 승인 완료',out.tempPassword);await views.requests();}catch(e){note(e.message,true);b.disabled=false;}});
 },
 async model(){const {llm,credits}=await api('/v1/admin/model');view.innerHTML='<div class="card"><h2>GPT 연결</h2><p>'+esc(llm.configured?'설정됨':'미설정')+' · '+esc(llm.model)+'</p><p class="sub">'+esc(llm.endpoint)+'</p><p>'+esc(llm.purpose)+'</p><p>최근 호출: '+esc(llm.last?.status||'재시작 이후 호출 없음')+' · '+esc(llm.last?.model||'')+'</p></div><div class="card"><h2>MonoGPT 잔여 크레딧</h2><p>'+n(credits.remaining)+' / '+n(credits.total)+'</p><p class="sub">'+dt(credits.checkedAt)+'에 웹 로그인으로 확인한 값 · 실시간 아님</p><p>'+esc(credits.reason)+'</p><a href="https://monogpt.kr/apps/mono-router" target="_blank" rel="noopener noreferrer">MonoGPT 로그인 후 최신 잔액 확인</a></div>';},
  async users() {
    const { users } = await api('/v1/admin/users');
    view.innerHTML = `<div class="tool"><h2>사용자 ${users.length}명</h2><div class="acts"><button id="add">+ 계정 발급</button></div></div>
    <div class="scroll"><table class="tbl"><tr><th>아이디·이름</th><th>역할·상태</th><th class="num">오늘 질문</th><th class="num">오늘 토큰</th><th class="num">로그인</th><th>세션 한도</th><th>기기·최근 로그인</th><th>작업</th></tr>
    ${users.map(u => `<tr><td><b>${esc(u.loginId)}</b><br><span class="sub">${esc(u.displayName)}${u.memo ? ' · ' + esc(u.memo) : ''}</span></td>
      <td>${u.role === 'admin' ? '관리자' : '테스터'}<br><span class="pill ${u.status === 'active' ? 'ok' : 'bad'}">${u.status === 'active' ? '사용' : '중지'}</span>${u.lockedUntil && new Date(u.lockedUntil) > new Date() ? ' <span class="pill warn">잠김</span>' : ''}${u.activeSessions ? ' <span class="pill ok">접속 중</span>' : ''}${u.mustChangePassword ? ' <span class="pill warn">비번 변경 대기</span>' : ''}</td>
      <td class="num">${n(u.today.messages)}/${n(u.limits.dailyMessages)}${u.today.blocked ? `<br><span class="sub">거절 ${u.today.blocked}</span>` : ''}</td><td class="num">${n(u.today.tokens)}/${n(u.limits.dailyTokens)}</td>
      <td class="num">${n(u.today.sessions)}<br><span class="sub">${u.role === "admin" ? "관리자 제한 면제" : "24시간 1회"}</span></td><td>${u.limits.sessionMinutes}분 · 질문 ${u.limits.sessionMessages}</td><td>${esc(u.device?.platform)}<br>${esc(u.device?.browser)}<br>${dt(u.lastLoginAt)}${u.nextLoginAt?`<br><span class="sub">재이용 ${dt(u.nextLoginAt)}</span>`:""}</td>
      <td><div class="acts" data-id="${u.id}" data-login="${esc(u.loginId)}"><button data-a="limits">한도</button><button data-a="reset">비번 초기화</button>${u.lockedUntil ? '<button data-a="unlock">잠금 해제</button>' : ''}
        <button data-a="toggle" class="${u.status === 'active' ? 'danger' : ''}">${u.status === 'active' ? '중지' : '재개'}</button><button data-a="chats">대화</button></div></td></tr>`).join('')}</table></div>`;
    $('#add').onclick = async () => {
      const r = await dialog(`<h2>계정 발급</h2><label>이메일 아이디(관리자는 기존 아이디 가능)<input name="loginId" required maxlength="254"></label><label>이름<input name="displayName" required maxlength="40"></label>
        <label>역할<select name="role"><option value="tester">테스터</option><option value="admin">관리자</option></select></label><label>메모<input name="memo" maxlength="100"></label>
        <p class="hint">한도 기본값: 일반 사용자: 세션 10분 고정·24시간에 1회 로그인, 세션당 질문 30·하루 질문 100·토큰 30,000. 발급 후 '한도'에서 바꿀 수 있습니다.</p>`,
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
            <label>하루 AI 토큰<input name="dailyTokens" type="number" min="0" value="${L.dailyTokens}"></label></div><p class="hint">일반 사용자는 10분·24시간 1회 고정입니다. 관리자 세션 시간 변경은 다음 로그인부터 적용됩니다.</p>`,
          fd => patch(Object.fromEntries([...fd].map(([k, v]) => [k, Number(v)]))));
          if (r) note(`${login} 한도를 바꿨습니다`);
        } else if (b.dataset.a === 'reset') {
          if (!confirm(`${login} 비밀번호를 초기화할까요? 접속 중인 세션도 종료됩니다.`)) return;
          const r = await patch({ resetPassword: true, unlock: true }); await showSecret(`${login} 비밀번호를 초기화했습니다`, r.tempPassword);
        } else if (b.dataset.a === 'unlock') { await patch({ unlock: true }); note('잠금을 풀었습니다'); }
        else if (b.dataset.a === 'toggle') {
          const off = u.status === 'active';
          if (off && !confirm(`${login} 계정을 중지할까요? 접속 중인 세션도 즉시 종료됩니다.`)) return;
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
    view.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('이 세션을 강제 종료할까요?')) return; await api(`/v1/admin/sessions/${b.dataset.revoke}/revoke`, { method: 'POST', body: '{}' }); note('세션을 종료했습니다'); views.sessions(opt); });
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
    if (!opt.session && !opt.user) { view.innerHTML = '<div class="card"><p class="sub">세션 탭이나 사용자 탭에서 "대화"를 눌러 열람할 대화를 고르세요.</p></div>'; return; }
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
  async actions() {
    const { actions } = await api('/v1/admin/actions');
    view.innerHTML = `<div class="tool"><h2>관리자 작업 기록</h2></div><div class="scroll"><table class="tbl"><tr><th>시각</th><th>관리자</th><th>작업</th><th>대상</th><th>내용</th></tr>
    ${actions.map(a => `<tr><td>${dt(a.at)}</td><td>${esc(a.admin ?? 'CLI')}</td><td>${esc(a.action)}</td><td>${esc(a.target ?? '')}</td><td class="sub">${esc(JSON.stringify(a.detail ?? {}))}</td></tr>`).join('')}</table></div>`;
  }
};
async function go(v, opt) {
  current = v; document.querySelectorAll('#atabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  try { await views[v](opt); } catch (e) { if (e.status !== 401) view.innerHTML = `<div class="card"><p class="sub">${esc(e.message)}</p></div>`; }
}
document.querySelectorAll('#atabs button').forEach(b => b.onclick = () => go(b.dataset.v));

(async () => {
  const h = await health();
  if (h.error) return gone(`서버 연결 실패: ${h.error}`);
  if (state.authMode !== 'required') return gone('서버가 로그인 없이 동작 중입니다(AUTH_MODE=off). 관리자 기능은 로그인 모드에서만 씁니다.');
  if (!state.auth?.token) return gone('이 탭에 로그인 정보가 없습니다.');
  try {
    const me = await api('/v1/auth/me');
    if (me.role !== 'admin') return gone('관리자 계정이 아닙니다.');
    syncExpiry(me.remainingSec);
    $('#who').textContent = `${me.user.displayName}(${me.user.loginId}) · 세션 ${me.limits.sessionMinutes}분`;
    startTimer($('#timer'), { onWarn: s => note(`약 ${s}초 뒤 자동 로그아웃됩니다`), onExpire: () => { logout('expired'); gone('이용 시간이 끝나 자동 로그아웃됐습니다.'); } });
    go('users');
  } catch (e) { if (e.status !== 401) gone(e.message); }
})();
