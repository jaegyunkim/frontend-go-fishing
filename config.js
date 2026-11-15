// 기본 백엔드 주소(맥미니 Caddy HTTPS, TP-Link DDNS 고정 이름). 비밀키는 절대 넣지 않습니다.
window.GOFISHING_API = 'https://lonbekim.tplinkdns.com';
// 기본 주소에 연결되지 않을 때 차례로 시도하는 예비 주소(공인 IP 기반, IP가 바뀌면 무효)
window.GOFISHING_API_FALLBACKS = ['https://121-175-197-249.sslip.io'];
