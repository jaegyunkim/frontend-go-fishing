// 안전 안내·도움말 문구: 필수 안내 포함, 정하지 않은 내용은 자리표시로만.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFETY_NOTE, helpHtml, TAGLINE, CONTACT_PLACEHOLDER } from '../guide.js';
test('안전 안내에 보장 없음·특보 확인·출조 미루기·122/119 포함', () => {
  for (const s of ['조과·안전·출입을 보장하지 않아요', '기상청 특보', '출조를 미루세요', 'tel:122', 'tel:119']) assert.ok(SAFETY_NOTE.includes(s), s);
});
test('도움말에 소개 문구와 문의처 자리표시, 요금·삭제 방법은 지어내지 않음', () => {
  const h = helpHtml();
  assert.ok(h.includes(TAGLINE)); assert.ok(h.includes(CONTACT_PLACEHOLDER));
  assert.ok(!/요금|원\/|무료|삭제 방법|@/.test(h));
});
import { readFileSync } from 'node:fs';
test('로그인 화면에는 안전 안내 상자가 없고, 다른 화면·설정 창의 안전 안내는 그대로', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(!html.includes('loginSafety') && !app.includes('loginSafety'));
  const login = html.slice(html.indexOf('id="loginForm"'), html.indexOf('이용 안내'));
  assert.ok(!login.includes('안전 안내') && !login.includes('data-safety'));
  assert.ok(html.includes('이용 안내'));
  assert.ok(html.includes('data-safety'));            // 설정 창 도움말
  assert.ok((app.match(/SAFETY_NOTE/g) || []).length >= 4); // 추천 결과·출조 자제·상세 브리핑 등
});
