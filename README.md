# frontend-go-fishing · 어디물어 (모바일 웹)

바다낚시 출조 AI 에이전트 **어디물어**의 모바일 화면입니다. GitHub Pages 로 배포됩니다.

**👉 https://jaegyunkim.github.io/frontend-go-fishing/**

- 대화: 출발지·날짜·지역을 말하면 대표 포인트 → 바다 상태 → 추천 TOP3 → 상세 브리핑
- 브리핑: 바다낚시지수·물때·파고·풍속·수온·특보·조석·일출몰 / 포인트 정보 / 네이버 지도 / 고속도로·일반도로 경로와 통행료·유류비 / 실시간 돌발 / 주변 2km(낚시점·편의점·주차·화장실·음식·약국·병원·숙박·주유소) / 가장 가까운 응급실 / 안전 체크 / 출처·수집 상태
- PWA: 홈 화면에 추가 가능

## 구조
이 저장소는 **정적 파일만** 있습니다(HTML/CSS/JS, 빌드 없음). API 키·주소 같은 비밀은 없습니다.
데이터는 비공개 백엔드(`backend-go-fishing`, 맥미니 예정)가 공공데이터포털·기상청·국립해양조사원·카카오·네이버·오피넷·ITS·Notion 을 조회해 돌려줍니다.

## 백엔드 연결
1. 백엔드를 HTTPS 로 공개(Cloudflare Tunnel 등)
2. `config.js` 의 `window.GOFISHING_API` 에 주소 입력 후 커밋 — 또는 화면 ⚙︎ 설정 / `?api=https://…` 쿼리
3. 같은 컴퓨터에서 백엔드를 켰다면 `http://localhost:8787` 도 동작(Chrome 의 사설망 접근 허용 헤더 포함)

## 로컬 미리보기
```bash
python3 -m http.server 8080   # http://localhost:8080/?api=http://localhost:8787
```

> 공식 발표·관측과 공개 자료를 정리한 참고 정보입니다. 조과·안전·출입을 보장하지 않습니다. 해상사고 122 · 화재/구급 119
