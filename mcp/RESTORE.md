# mcp/ — 코드 복원 필요

MCP 서버 코드가 사라져서 `src/`, `tests/`가 비어 있습니다.

## 있어야 하는 것
- `src/`: 서비스(DraftService), MCP 서버(툴 9개), `stdio.ts`, HTTP 진입점(`POST /mcp`, `GET /healthz`)
- `tests/`: 서비스 9, 프로토콜 4, HTTP 4, stdio 실프로세스 1 (총 18개)
- `package.json` (npm 스크립트: `test`, `start:stdio`, `start:http`)

## 동작 기준
`docs/deployment/API_MCP_Spec.md`, `docs/deployment/Environment_Config.md` 참고.
