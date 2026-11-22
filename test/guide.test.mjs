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
