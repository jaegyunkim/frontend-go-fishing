// 관리자 "임시 비밀번호 메일 다시 보내기" 공용 문구·판단. 비밀번호·메일 원문은 다루지 않는다(가려진 주소만 표시).
export const RESEND_LABEL = '임시 비밀번호 메일 다시 보내기';
export const resendPath = id => `/v1/admin/users/${encodeURIComponent(id)}/resend-temp-password`;
export const resendName = u => String(u?.displayName || '').trim() || String(u?.loginId ?? '');
export const canResend = u => u?.status === 'active';
export const resendConfirmText = name => `${name}님에게 새 임시 비밀번호를 메일로 보낼까요? 기존 비밀번호는 더 이상 쓸 수 없어요.`;
export const resendSuccessText = (name, maskedEmail) => `${name}님(${maskedEmail})에게 새 임시 비밀번호를 보냈어요.`;
const GENERIC = '보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
export function resendErrorText(e) {
  switch (e?.code) {
    case 'NOT_ACTIVE': return '승인된 계정에만 보낼 수 있어요';
    case 'RATE_LIMITED': {
      const s = Math.ceil(Number(e.retryAfter));
      return `잠시 뒤에 다시 시도해 주세요(같은 계정에는 1분에 1번, 하루 5번까지)${s > 0 ? ` · ${s}초 뒤에 다시 보낼 수 있어요` : ''}`;
    }
    case 'MAIL_FAILED': return '메일을 보내지 못했어요. 기존 비밀번호는 그대로 쓸 수 있어요. 잠시 뒤 다시 시도해 주세요';
    case 'NOT_FOUND': return '계정을 찾을 수 없어요';
    default: return GENERIC;
  }
}
