# web/ — 코드 복원 필요

Next.js 웹앱 코드가 사라져서 이 폴더는 비어 있습니다. 코드를 넣기 전에 아래를 기준으로 확인하세요.

## 있어야 하는 것
- `src/core/` 파이프라인·규칙·`describe.ts` (MCP와 공유), `src/app/api/run/route.ts`
- 화면 S1~S4, 교체 모달, 라이브러리
- `package.json`, `tsconfig.json` (React 19, Next.js, vitest)
- `public/icons`, Pretendard 폰트 (배포 시 자체 호스팅)

## 동작 기준
- `/api/run`: 형식, 이미지 1~4장, 역할, 글자 수, id 형식 검증, 잘못된 요청은 400
- 제품 이미지가 없으면 시작하지 않음, "샘플 제품으로 체험하기" 제공
- 재작업 실패 시 현재 결과 유지 + 안내 + 제외했던 레퍼런스 복원
- 마지막 확인: vitest 41개, tsc·next build 통과
