# web/ — 복원 완료 (2026-09-30)

Next.js 16 + React 19 웹앱. 핵심 로직은 `src/core/`(MCP와 공유).

## 구성
- `src/core/` 규칙·충돌 해결·매칭·방향·프롬프트 컴파일러·검증·파이프라인·`describe.ts`·mock 어댑터 5곳
- `src/app/page.tsx` 화면 S1 입력, S2 프롬프트, S4 상세, 교체 모달, 라이브러리 (**S3는 정의 확인 필요 — 미구현**)
- `src/app/api/run/route.ts` → `src/lib/run.ts` (zod 입력 검증, 잘못된 요청 400)
- `src/app/api/assets/[kind]/[id]` 레퍼런스·샘플 제품 이미지

## 실행
```bash
npm ci            # .npmrc: legacy-peer-deps=true (vitest 4 선택 peer 의존성 때문에 필요)
npx tsc --noEmit && npx vitest run && npx next build
npm run dev
```

## 마지막 확인 (2026-09-30)
tsc 통과, vitest 52개 통과, next build 통과, Playwright(Chromium)로 흐름 수동 확인
(샘플 제품 → 시안 3개 → 교체 모달 대안 3개 → 교체 → 수정사항 P1 위반 경고).
