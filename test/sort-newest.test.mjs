// 목록 최신순 정렬: 유틸(날짜 문자열·누락 값·동일 시각), 사용자 목록 역할 우선, 화면 연결 확인.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../sort-newest.js', import.meta.url), 'utf8');
const { sortNewest, sortUsers, roleRank } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const ids = l => l.map(x => x.id);

test('날짜는 Date로 비교(표기 형식이 달라도 최신순)', () => {
  const l = [{ id: 1, at: '2026-11-01T09:00:00+09:00' }, { id: 2, at: '2026-11-01T00:30:00Z' }, { id: 3, at: '2026-10-31 23:00:00' }, { id: 4, at: '2026-11-02T00:00:00Z' }];
  assert.deepEqual(ids(sortNewest(l, x => x.at)), [4, 2, 1, 3]);
});
test('시각이 없거나 잘못되면 뒤로, 같은 시각은 id 내림차순', () => {
  const l = [{ id: 1 }, { id: 2, at: 'abc' }, { id: 9, at: '2026-01-01T00:00:00Z' }, { id: 10, at: '2026-01-01T00:00:00Z' }, { id: 5, at: null }];
  assert.deepEqual(ids(sortNewest(l, x => x.at)), [10, 9, 5, 2, 1]);
});
test('id도 없으면 원래 순서 유지, 원본은 바뀌지 않음', () => {
  const l = [{ n: 'a' }, { n: 'b' }, { n: 'c' }]; const c = [...l];
  assert.deepEqual(sortNewest(l, () => null, () => null).map(x => x.n), ['a', 'b', 'c']);
  assert.deepEqual(l, c);
  assert.deepEqual(sortNewest(undefined, () => 0), []);
});
test('사용자 목록: 관리자 → 내부 테스터 → 베타 테스터, 묶음 안은 최신순(상태 무관)', () => {
  const u = [
    { id: 1, role: 'user', status: 'active', createdAt: '2026-11-05T00:00:00Z' },
    { id: 2, role: 'admin', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    { id: 3, role: 'tester', status: 'disabled', createdAt: '2026-10-01T00:00:00Z' },
    { id: 4, role: 'user', status: 'disabled', createdAt: '2026-11-09T00:00:00Z' },
    { id: 5, role: 'tester', status: 'active', createdAt: '2026-10-20T00:00:00Z' },
    { id: 6, role: 'admin', status: 'active', createdAt: '2026-03-01T00:00:00Z' },
    { id: 7, role: 'guest', status: 'active', createdAt: '2026-12-01T00:00:00Z' },
    { id: 8, role: 'user', status: 'active' },
    { id: 9, role: 'user', status: 'active', createdAt: '2026-11-05T00:00:00Z' },
  ];
  assert.deepEqual(ids(sortUsers(u)), [6, 2, 5, 3, 4, 9, 1, 8, 7]);
  assert.ok(roleRank('admin') < roleRank('tester') && roleRank('tester') < roleRank('user') && roleRank('user') < roleRank('x'));
});
test('신청 승인 목록: 신청 시각 최신순', () => {
  const r = [{ id: 1, created_at: '2026-11-01T00:00:00Z' }, { id: 2, created_at: '2026-11-03T00:00:00Z' }, { id: 3, created_at: '2026-11-02T00:00:00Z' }];
  assert.deepEqual(ids(sortNewest(r, x => x.created_at)), [2, 3, 1]);
});
test('화면 연결: 관리자·일반 목록이 정렬 유틸을 거친다', () => {
  const admin = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  for (const k of ['sortNewest(requests', 'sortUsers(users)', 'sortNewest(sessions', 'sortNewest(usage', 'sortNewest(logins', 'sortNewest(reports', 'sortNewest(opinions', 'sortNewest(actions']) assert.ok(admin.includes(k), k);
  assert.equal((admin.match(/sortNewest\(logins/g) || []).length, 2);
  assert.ok(app.includes('sortNewest(sessions, s => s.startedAt'));
});
