// 「신청 승인」 탭 승인 완료 카드의 「임시 비밀번호 생성」: 표시 조건·확인 창·최초 승인 팝업 재사용·오류 문구·비밀번호 비보존. 실제 요청은 보내지 않는다.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const load = f => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')).toString('base64'));
const m = await load('resend-temp.js');
const am = await load('approval-email.js');
const admin = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const blk = admin.slice(admin.indexOf("forEach(b=>b.onclick=async()=>{\n  if(b.disabled)return;const id=b.dataset.regen"), admin.indexOf("[data-review]')", admin.indexOf('data-regen]')));
const users = [{ id: 7, loginId: 'Kim@Test.com', displayName: '민수', status: 'active' }, { id: 8, loginId: 'off@test.com', status: 'disabled' }];

test('버튼 표시 조건: 승인 완료 + 사용 중 계정만', () => {
  const u = m.userForRequest(users, { login_id: 'kim@test.com' });
  assert.equal(u.id, 7);
  assert.equal(m.canGenerateOnRequest({ status: 'approved', login_id: 'kim@test.com' }, u), true);
  for (const s of ['pending', 'rejected', undefined]) assert.equal(m.canGenerateOnRequest({ status: s }, u), false);
  assert.equal(m.canGenerateOnRequest({ status: 'approved' }, m.userForRequest(users, { login_id: 'off@test.com' })), false);
  assert.equal(m.canGenerateOnRequest({ status: 'approved' }, m.userForRequest(users, { login_id: 'none@test.com' })), false);
  assert.equal(m.canGenerateOnRequest({ status: 'approved' }, null), false);
  assert.equal(m.GENERATE_LABEL, '임시 비밀번호 생성');
  assert.match(admin, /canGenerateOnRequest\(r,userForRequest\(users,r\)\)\?'<div class="acts"><button type="button" class="resend-btn" data-regen=/);
});
test('확인 창 먼저(취소하면 호출 없음)·호출 중 비활성', () => {
  assert.match(blk, /if\(b\.disabled\)return;/);
  assert.match(blk, /if\(!confirm\(resendConfirmText\(resendName\(u\)\)\)\)return;\s*b\.disabled=true;/);
  assert.equal(m.resendConfirmText('민수'), '민수님에게 새 임시 비밀번호를 메일로 보낼까요? 기존 비밀번호는 더 이상 쓸 수 없어요.');
  assert.match(blk, /finally\{[^}]*b\.disabled=false/);
});
test('성공 시 최초 승인과 같은 showSecret 팝업(제목·메일 주소 인자 동일)과 approvalMailto 재사용', () => {
  assert.match(blk, /resendPath\(id\),\{method:'POST'\}/);
  assert.match(blk, /showSecret\(u\.loginId\+' 승인 완료',out\.tempPassword,u\.loginId\)/);
  assert.match(admin, /showSecret\(out\.user\.loginId\+' 승인 완료',out\.tempPassword,out\.user\.loginId\)/);
  assert.ok(!/mailto|subject=|임시 비밀번호:/.test(blk), '메일 문구를 복제하지 않는다');
  const url = new URL(am.approvalMailto('kim@test.com', 'Tmp-1&?#'));
  assert.equal(url.searchParams.get('subject'), '바다낚시 출조 AI 에이전트, 가입이 승인되었어요!');
});
test('오류 코드별 문구 재사용', () => {
  assert.match(blk, /catch\(e\)\{note\(resendErrorText\(e\),true\)/);
  assert.equal(m.resendErrorText({ code: 'NOT_ACTIVE' }), '승인된 계정에만 보낼 수 있어요');
  assert.equal(m.resendErrorText({ code: 'NOT_FOUND' }), '계정을 찾을 수 없어요');
  assert.match(m.resendErrorText({ code: 'RATE_LIMITED', retryAfter: 30 }), /30초 뒤/);
});
test('임시 비밀번호는 팝업 외에 남기지 않는다', () => {
  assert.ok(!/console|localStorage|sessionStorage|telemetry|innerHTML|textContent|setAttribute/.test(blk));
  assert.match(blk, /out\.tempPassword=null;out=null/);
});
