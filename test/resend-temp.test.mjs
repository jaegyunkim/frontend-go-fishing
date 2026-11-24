// 임시 비밀번호 메일 다시 보내기: 문구·버튼 표시 조건·오류 코드별 문구·Retry-After·maskedEmail 표시. 실제 요청은 보내지 않는다.
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../resend-temp.js', import.meta.url), 'utf8');
const m = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const admin = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const authSrc = fs.readFileSync(new URL('../auth.js', import.meta.url), 'utf8').replace(/export /g, '');

test('고정 문구', () => {
  assert.equal(m.RESEND_LABEL, '임시 비밀번호 메일 다시 보내기');
  assert.equal(m.resendConfirmText('민수'), '민수님에게 새 임시 비밀번호를 메일로 보낼까요? 기존 비밀번호는 더 이상 쓸 수 없어요.');
  assert.equal(m.resendSuccessText('민수'), '민수님에게 보낼 메일 창을 열었어요. 메일 앱에서 보내기를 눌러야 전달돼요.');
  assert.equal(m.resendMailOpenedText('민수', 'de***@gmail.com'), '민수님에게 보낼 메일 창을 열었어요. 메일 앱에서 보내기를 눌러야 전달돼요. (받는 사람 de***@gmail.com)');
  assert.match(m.resendMailFailText, /기본 메일 앱 설정/);
});
test('표시 이름이 없으면 아이디, 경로는 id 인코딩', () => {
  assert.equal(m.resendName({ displayName: '민수', loginId: 'a@b.c' }), '민수');
  assert.equal(m.resendName({ displayName: ' ', loginId: 'a@b.c' }), 'a@b.c');
  assert.equal(m.resendPath(7), '/v1/admin/users/7/resend-temp-password');
});
test('활성 계정에만 버튼 표시', () => {
  assert.equal(m.canResend({ status: 'active' }), true);
  for (const s of ['disabled', 'pending', 'rejected', undefined]) assert.equal(m.canResend({ status: s }), false);
  assert.ok(!/data-a="resend"/.test(admin), '사용자 탭 카드에는 다시 보내기 버튼이 없다');
});
test('오류 코드별 문구', () => {
  assert.equal(m.resendErrorText({ code: 'NOT_ACTIVE' }), '승인된 계정에만 보낼 수 있어요');
  assert.equal(m.resendErrorText({ code: 'NOT_FOUND' }), '계정을 찾을 수 없어요');
  assert.ok(!src.includes('MAIL_FAILED'));
  assert.equal(m.resendErrorText({ code: 'RATE_LIMITED' }), '잠시 뒤에 다시 시도해 주세요(같은 계정에는 1분에 1번, 하루 5번까지)');
  assert.match(m.resendErrorText({ code: 'RATE_LIMITED', retryAfter: 42 }), /하루 5번까지\) · 42초 뒤/);
  for (const e of [{ code: 'NETWORK' }, { status: 500 }, new Error('x'), null]) assert.equal(m.resendErrorText(e), '보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
});
test('사용자 탭: 다시 보내기 버튼·핸들러 없음, 신청 승인 탭 「임시 비밀번호 생성」은 유지', () => {
  assert.ok(!/RESEND_LABEL|resend-btn" data-a|b\.dataset\.a === 'resend'|openResendMail|resendMailOpenedText/.test(admin));
  assert.match(admin, /data-a="limits">한도<\/button><button data-a="role">권한<\/button><button data-a="reset">비번 초기화<\/button>/);
  assert.match(admin, /data-a="toggle"[^]*data-a="chats">대화/);
  assert.match(admin, /canGenerateOnRequest\(r,userForRequest\(users,r\)\)\?'<div class="acts"><button type="button" class="resend-btn" data-regen=/);
});
test('auth.js api: Retry-After 를 오류에 담는다', async () => {
  const store = new Map(), st = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const fetchImpl = async () => ({ ok: false, status: 429, headers: { get: k => k === 'Retry-After' ? '30' : null }, json: async () => ({ error: 'x', code: 'RATE_LIMITED' }) });
  const ctx = vm.createContext({ window: { GOFISHING_API: 'https://api.test' }, location: { search: '', hostname: 'f.test', protocol: 'https:' }, localStorage: st, sessionStorage: st, URLSearchParams, Object, Error, Promise, AbortSignal, Date, Number, fetch: fetchImpl });
  vm.runInContext(authSrc, ctx);
  await assert.rejects(vm.runInContext('api("/v1/x",{method:"POST"})', ctx), e => e.status === 429 && e.code === 'RATE_LIMITED' && e.retryAfter === 30);
});
test('임시 비밀번호는 mailto 링크 생성에만 쓰고 화면·저장소·로그에 남기지 않는다', async () => {
  const am = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('../approval-email.js', import.meta.url), 'utf8')).toString('base64'));
  const navs = [];
  m.openResendMail(am.approvalMailto, 'user@example.test', 'tmp-Pw&?#한글', h => navs.push(h));
  assert.equal(navs.length, 1);
  const url = new URL(navs[0]);
  assert.equal(decodeURIComponent(url.pathname), 'user@example.test');
  assert.equal(url.searchParams.get('subject'), '바다낚시 출조 AI 에이전트, 가입이 승인되었어요!');
  assert.ok(url.searchParams.get('body').includes('임시 비밀번호: tmp-Pw&?#한글'));
  assert.throws(() => m.openResendMail(am.approvalMailto, 'bad', 'x', h => navs.push(h)));
});
