// SEO·GEO 정적 점검: 공개 페이지별 title·description 길이, 서비스 명칭 통일.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const len = s => [...s].length;
export const meta = (h, re) => (h.match(re) || [])[1];
export const PUBLIC = ['index.html', 'register.html', 'about.html'].filter(f => existsSync(new URL('../' + f, import.meta.url)));
export const SERVICE = '어디물어 — 바다낚시 출조 AI 에이전트(베타)';

test('공개 페이지마다 고유한 title(40자 이내)·description(80자 이내)', () => {
  const titles = new Set(), descs = new Set();
  for (const f of PUBLIC) {
    const h = read(f);
    const t = meta(h, /<title>([^<]*)<\/title>/), d = meta(h, /<meta name="description" content="([^"]*)"/);
    assert.ok(t && len(t) <= 40, `${f} title ${t && len(t)}자`);
    assert.ok(d && len(d) <= 80, `${f} description ${d && len(d)}자`);
    assert.ok(t.includes('어디물어'), f);
    titles.add(t); descs.add(d);
    assert.equal(meta(h, /property="og:title" content="([^"]*)"/), t, `${f} og:title`);
    assert.equal(meta(h, /name="twitter:title" content="([^"]*)"/), t, `${f} twitter:title`);
    assert.equal(meta(h, /property="og:description" content="([^"]*)"/), d, `${f} og:description`);
    assert.equal(meta(h, /name="twitter:description" content="([^"]*)"/), d, `${f} twitter:description`);
    assert.match(h, /<html lang="ko">/);
    assert.match(h, /name="viewport"/);
  }
  assert.equal(titles.size, PUBLIC.length, 'title 중복');
  assert.equal(descs.size, PUBLIC.length, 'description 중복');
});

test('서비스 명칭 통일: 로그인 화면 title과 manifest 이름이 같다', () => {
  assert.equal(meta(read('index.html'), /<title>([^<]*)<\/title>/), SERVICE);
  assert.equal(JSON.parse(read('manifest.webmanifest')).name, SERVICE);
});
