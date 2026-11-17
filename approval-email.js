// 클릭 순간에만 mailto URL을 만든다. 비밀번호를 DOM 링크·저장소·로그에 남기지 않는다.
export function approvalMailto(loginId, temporaryPassword) {
  const recipient = String(loginId ?? '').trim();
  if (!/^[^\s@?&#,;<>]+@[^\s@?&#,;<>]+\.[^\s@?&#,;<>]+$/.test(recipient) || /[\r\n]/.test(recipient)) {
    throw new Error('신청자 이메일 주소를 확인해 주십시오.');
  }
  if (typeof temporaryPassword !== 'string' || !temporaryPassword) throw new Error('임시 비밀번호가 없습니다.');
  const subject = '바다낚시 출조 AI 에이전트, 가입이 승인되었습니다!';
  const body = [
    '안녕하십시오! 바다낚시 출조 AI 에이전트 ‘어디물어’에 오신 것을 환영합니다.',
    '',
    '신청하신 가입이 승인되었습니다. 아래 주소에서 서비스를 이용해 주십시오.',
    'https://jaegyunkim.github.io/frontend-go-fishing/',
    '',
    `로그인 이메일: ${recipient}`,
    `임시 비밀번호: ${temporaryPassword}`,
    '',
    '위 임시 비밀번호로 로그인하신 뒤, 안전한 이용을 위해 비밀번호를 꼭 변경해 주십시오.',
    '임시 비밀번호는 다른 사람에게 공유하지 말아 주십시오.',
    '',
    '어디물어와 함께 안전하고 즐거운 바다낚시를 준비해 보십시오.',
    '감사합니다.'
  ].join('\r\n');
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
