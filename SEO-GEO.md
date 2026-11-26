# SEO·GEO 점검 메모 (v1.31.0)

사이트 주소: https://jaegyunkim.github.io/frontend-go-fishing/ (GitHub Pages 프로젝트 사이트, HTTPS·HTTP 200)

## 공개·비공개 페이지
| 페이지 | 색인 | canonical |
|---|---|---|
| `/` (index.html, 로그인) | 허용 | `…/frontend-go-fishing/` (index.html 주소는 이 주소로 모음) |
| `about.html` (소개·사용법·FAQ) | 허용 | `…/about.html` |
| `register.html` (이용 신청) | 허용 | `…/register.html` |
| `admin.html`, `server-settings.html` | `noindex,nofollow` | 없음 |

## robots.txt 한계
GitHub 프로젝트 사이트에서는 크롤러가 도메인 루트(`https://jaegyunkim.github.io/robots.txt`)만 읽는다. 저장소의 `robots.txt`(`/frontend-go-fishing/robots.txt`)는 효력이 없고 sitemap 위치 안내용이다. 루트 robots.txt를 두려면 `jaegyunkim.github.io` 사용자 사이트 저장소가 필요하다. 없으면 AI 크롤러(GPTBot, Google-Extended, PerplexityBot 등)를 포함해 허용이 기본값이다. 차단 규칙은 넣지 않았다.

## 검색 도구 등록 (오너가 직접, 토큰은 각 도구가 발급)
### Google Search Console
1. 속성 추가 → **URL 접두어**에 `https://jaegyunkim.github.io/frontend-go-fishing/` 입력(도메인 방식은 DNS 접근이 필요해 불가).
2. 소유권 확인 방법 **HTML 태그** 선택 → 발급된 `<meta name="google-site-verification" content="…">`를 `index.html`의 `<head>`(canonical 줄 근처)에 넣고 배포 → 확인.
3. 왼쪽 **Sitemaps**에 `sitemap.xml` 제출(전체 주소 `https://jaegyunkim.github.io/frontend-go-fishing/sitemap.xml`).
4. URL 검사로 `/`, `about.html`, `register.html` 색인 요청.
### 네이버 서치어드바이저
1. 웹마스터 도구 → 사이트 추가에 `https://jaegyunkim.github.io` 입력(네이버는 호스트 단위 등록, 하위 경로 `/frontend-go-fishing/`는 사이트맵·요청으로 수집).
2. 소유확인 **HTML 태그** 선택 → `<meta name="naver-site-verification" content="…">`를 `index.html`의 `<head>`에 넣고 배포 → 확인. (사용자 사이트 저장소가 없으면 호스트 루트 확인이 막힐 수 있음 → 그때는 사용자 사이트 저장소를 만들어 확인.)
3. 요청 → 사이트맵 제출에 `https://jaegyunkim.github.io/frontend-go-fishing/sitemap.xml`, 웹 페이지 수집 요청으로 세 주소 요청.
4. 한쪽에서만 색인이 빠진 페이지가 있는지 두 도구를 비교.
※ 토큰 값은 코드에 임의로 만들어 넣지 않았다. 등록해도 노출이 보장되지는 않는다.

## 모바일·성능 점검 (320/375/430px)
- `lang="ko"`, `viewport`(width=device-width, initial-scale=1) 모든 페이지 확인.
- 로그인·소개 화면 가로 넘침 없음(scrollWidth = 화면 너비), 본문 최소 글자 크기 11.5px(기존 안내 문구) 이상, 소개 페이지 본문 14.5px.
- 이미지: og-image.png 1200×630 약 117KB, 로그인 그림 svg 1.5KB, 앱 아이콘 svg. 추가 이미지 없음.
- 렌더 차단: CSS 1개(style.css 약 53KB, gzip 약 12.7KB)만 head에서 로드, 스크립트는 body 끝(config·telemetry·모듈). 외부 글꼴·@import 없음. about.html은 스크립트 없음(JSON-LD 제외).
- 눈에 띄는 개선 필요 없음 → 로직 변경 없음.

## 이번에 하지 않은 것
지역·어종별 콘텐츠 페이지, 조황 데이터 공개, 외부 프로필·지도 등록, AI 인용 측정(검증된 자료·데이터가 필요하거나 코드 밖 작업), 개인정보 처리방침 문안(법률 검토 전).
