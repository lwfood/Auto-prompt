# mcp/ — 복원 완료 (2026-09-30)

- `src/service.ts` DraftService (job 메모리 1시간·최대 200개, 추천 제외 서버 전역)
- `src/server.ts` 툴 9개 (`TOOL_NAMES`), 한국어 텍스트 + `structuredContent`, 오류 `isError`, zod 검증
- `src/stdio.ts`, `src/http.ts` (`POST /mcp` stateless, `GET /healthz`, Bearer 인증, 404/405/401)
- `tests/`: 서비스 9, 프로토콜 4, HTTP 4, stdio 실프로세스 1 (총 18개)

```bash
npm ci && npx tsc --noEmit && npx vitest run
npm run start:stdio      # 로컬 클라이언트
MCP_API_KEY=... npm run start:http
```
코어는 `../web/src/core`를 직접 import 한다 (web 의존성 설치 없이 동작, 코어는 외부 패키지 없음).
