// 관리자 "임시 비밀번호 메일 다시 보내기" 공용 문구·판단. 비밀번호·메일 원문은 다루지 않는다(가려진 주소만 표시).
export const RESEND_LABEL = '임시 비밀번호 메일 다시 보내기';
export const resendPath = id => `/v1/admin/users/${encodeURIComponent(id)}/resend-temp-password`;
export const resendName = u => String(u?.displayName || '').trim() || String(u?.loginId ?? '');
export const canResend = u => u?.status === 'active';
// 「신청 승인」 탭: 신청 카드에는 계정 id가 없어 사용자 목록(/v1/admin/users)에서 로그인 아이디로 찾는다.
export const GENERATE_LABEL = '임시 비밀번호 생성';
const lid = v => String(v ?? '').trim().toLowerCase();
export const userForRequest = (users, r) => (Array.isArray(users) ? users : []).find(u => lid(u?.loginId) && lid(u.loginId) === lid(r?.login_id)) || null;
// 승인 완료 카드이면서 계정이 사용 중일 때만 버튼을 보인다(승인 대기·거절·정지·계정 못 찾음은 숨김).
export const canGenerateOnRequest = (r, u) => r?.status === 'approved' && !!u && u.id != null && canResend(u);
export const resendConfirmText = name => `${name}님에게 새 임시 비밀번호를 메일로 보낼까요? 기존 비밀번호는 더 이상 쓸 수 없어요.`;
export const resendSuccessText = name => `${name}님에게 보낼 메일 창을 열었어요. 메일 앱에서 보내기를 눌러야 전달돼요.`;
export const resendMailOpenedText = (name, maskedEmail) => `${resendSuccessText(name)} (받는 사람 ${maskedEmail})`;
export const resendMailFailText = '메일 앱을 열지 못했어요. 기기의 기본 메일 앱 설정을 확인한 뒤 다시 눌러 주세요. 누를 때마다 새 임시 비밀번호가 만들어지고 이전 것은 쓸 수 없어요.';
// 임시 비밀번호는 mailto 링크를 만드는 이 순간에만 쓰고 바로 버린다(화면·DOM·저장소·로그에 남기지 않음).
export function openResendMail(mailtoFn, loginId, tempPassword, navigate) {
  navigate(mailtoFn(loginId, tempPassword));
}
const GENERIC = '보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
export function resendErrorText(e) {
  switch (e?.code) {
    case 'NOT_ACTIVE': return '승인된 계정에만 보낼 수 있어요';
    case 'RATE_LIMITED': {
      const s = Math.ceil(Number(e.retryAfter));
      return `잠시 뒤에 다시 시도해 주세요(같은 계정에는 1분에 1번, 하루 5번까지)${s > 0 ? ` · ${s}초 뒤에 다시 보낼 수 있어요` : ''}`;
    }
    case 'NOT_FOUND': return '계정을 찾을 수 없어요';
    default: return GENERIC;
  }
}
