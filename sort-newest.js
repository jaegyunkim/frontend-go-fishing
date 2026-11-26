// 목록 최신순(내림차순) 정렬 공용 유틸. 시각은 Date로 비교하고(문자열 비교 금지), 시각이 없거나 같으면 id 내림차순, 그래도 같으면 원래 순서를 유지한다.
export const toTime = v => { if (v == null || v === '') return NaN; const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime(); return Number.isFinite(t) ? t : NaN; };
const cmpId = (a, b) => {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
  const x = Number(a), y = Number(b);
  if (Number.isFinite(x) && Number.isFinite(y)) return y - x;
  return String(a) < String(b) ? 1 : String(a) > String(b) ? -1 : 0;
};
// 시각이 있는 항목이 앞, 시각이 큰(최근) 항목이 먼저. 같거나 없으면 id 내림차순. 원본 배열은 바꾸지 않는다.
export function sortNewest(list, getTime, getId = x => x?.id) {
  return (Array.isArray(list) ? list : []).map((x, i) => ({ x, i, t: toTime(getTime(x)) })).sort((a, b) => {
    const an = Number.isNaN(a.t), bn = Number.isNaN(b.t);
    if (an !== bn) return an ? 1 : -1;
    if (!an && a.t !== b.t) return b.t - a.t;
    return cmpId(getId(a.x), getId(b.x)) || a.i - b.i;
  }).map(e => e.x);
}
// 관리자 「사용자」 탭: 관리자 → 내부 테스터(tester) → 베타 테스터(user) → 그 밖의 역할 순으로 묶고, 각 묶음 안은 최신순.
export const ROLE_ORDER = ['admin', 'tester', 'user'];
export const roleRank = r => { const i = ROLE_ORDER.indexOf(r); return i < 0 ? ROLE_ORDER.length : i; };
export function sortUsers(users) {
  return (Array.isArray(users) ? users : []).map((u, i) => ({ u, i })).sort((a, b) => roleRank(a.u?.role) - roleRank(b.u?.role) || a.i - b.i).map(e => e.u)
    .reduce((acc, u) => { const g = acc.at(-1); if (g && roleRank(g[0].role) === roleRank(u.role)) g.push(u); else acc.push([u]); return acc; }, [])
    .flatMap(g => sortNewest(g, u => u.createdAt ?? u.created_at));
}
