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

const BASE = 'https://jaegyunkim.github.io/frontend-go-fishing/';
test('공개 페이지는 canonical(절대 주소)을 갖고 og:url과 같으며 noindex가 없다', () => {
  for (const f of PUBLIC) {
    const h = read(f);
    const c = meta(h, /<link rel="canonical" href="([^"]*)"/);
    assert.ok(c && c.startsWith(BASE), `${f} canonical`);
    assert.equal(c, meta(h, /property="og:url" content="([^"]*)"/), `${f} og:url`);
    assert.ok(!/name="robots"[^>]*noindex/.test(h), `${f} noindex 금지`);
  }
  assert.equal(meta(read('index.html'), /rel="canonical" href="([^"]*)"/), BASE, '로그인 화면 대표 주소는 /(index.html 아님)');
});

test('관리자·서버 연결 설정 페이지는 noindex,nofollow', () => {
  for (const f of ['admin.html', 'server-settings.html']) {
    const h = read(f);
    assert.equal(meta(h, /<meta name="robots" content="([^"]*)"/), 'noindex,nofollow', f);
    assert.ok(!/rel="canonical"/.test(h), `${f}에는 canonical을 두지 않음`);
  }
});

test('로그인 화면: 정적 HTML에 h1 하나와 정의 문장, 스크립트 없이도 로그인 화면이 보이게 함', () => {
  const h = read('index.html');
  assert.equal((h.match(/<h1[ >]/g) || []).length, 1, 'h1은 하나(앱 화면 상단 이름은 h1 아님)');
  const login = h.slice(h.indexOf('id="loginView"'), h.indexOf('id="appView"'));
  assert.match(login, /<h1>어디물어<\/h1>/);
  assert.match(login, /<p class="login-intro">어디물어는 출발지와 날짜를 말하면 바람·파도·물때 등 공공 자료를 바탕으로 출조 후보를 살펴 주는 대화형 바다낚시 서비스예요\(베타 테스트\)\.<\/p>/);
  assert.ok(!/(display:none|sr-only|visually-hidden)/.test(login.split('<p class="login-intro">')[1].split('</p>')[0]), '숨김 텍스트 금지');
  assert.match(h, /<noscript><style>#appView\{display:none!important\}#loginView\[hidden\]\{display:flex!important\}<\/style><\/noscript>/);
  assert.match(login, /<a class="about-link" href="about\.html">어디물어 소개<\/a>/);
  assert.ok(!login.includes('loginSafety'), '노란 안내 상자는 되살리지 않음');
});

import { FAQ } from '../guide.js';
const plain = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export const aboutFaq = () => {
  const h = read('about.html');
  const blk = h.slice(h.indexOf('class="about-faq"'), h.indexOf('</section>', h.indexOf('class="about-faq"')));
  return [...blk.matchAll(/<h3>([^<]*)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(m => [plain(m[1]), plain(m[2])]);
};

test('about.html: h1 하나, h1→h2→h3 계층(건너뛰기 없음), 이미지 속 글자 없음, 로그인 화면 링크', () => {
  const h = read('about.html');
  const hs = [...h.matchAll(/<h([1-6])[ >]/g)].map(m => +m[1]);
  assert.equal(hs.filter(n => n === 1).length, 1);
  assert.equal(hs[0], 1);
  hs.forEach((n, i) => { if (i) assert.ok(n <= hs[i - 1] + 1, `제목 단계 건너뜀: h${hs[i - 1]}→h${n}`); });
  assert.ok(hs.includes(2) && hs.includes(3));
  assert.match(h, /어디물어는 출발지와 날짜를 말하면 바람·파도·물때 등 공공 자료를 바탕으로 출조 후보를 살펴 주는 대화형 바다낚시 서비스예요\(베타 테스트\)/);
  assert.match(h, /추천은 조과·안전·출입을 보장하지 않아요/);
  assert.match(h, /href="\.\/"/);
  assert.ok(!/<img[^>]+alt="[^"]+"/.test(h), '의미 있는 글자는 이미지 말고 본문으로');
  assert.ok(!/<script/.test(h));
});

test('about.html 자주 묻는 질문은 앱 도움말(guide.js FAQ)과 같은 내용', () => {
  const faq = aboutFaq();
  assert.equal(faq.length, FAQ.length);
  FAQ.forEach(([q, a], i) => { assert.equal(faq[i][0], plain(q)); assert.equal(faq[i][1], plain(a)); });
});

test('about.html은 확인되지 않은 내용(요금·연락처·수치)을 쓰지 않음', () => {
  const body = read('about.html').split('<body>')[1];
  assert.ok(!/요금|무료|유료|@|\d{2,3}-\d{3,4}-\d{4}|정식 출시|삭제 방법/.test(body));
});
