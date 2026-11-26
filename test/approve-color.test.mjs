import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../admin.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
test('승인·비밀번호 발급 버튼만 approve-btn(주황) 클래스', () => {
  assert.match(js, /<button class="approve-btn" data-review="approve"/);
  assert.doesNotMatch(js, /class="approve-btn" data-review="reject"/);
  assert.match(css, /\.acts button\.approve-btn\{background:#ff6b3d/);
});
