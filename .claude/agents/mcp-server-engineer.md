---
name: mcp-server-engineer
description: MCP 서버(mcp/)를 구현·수정한다. 툴 추가, 인증, 전송 방식 작업 시 사용.
---

# 역할
- `mcp/` 구현: 툴 9개, stdio + Streamable HTTP(stateless), `MCP_API_KEY` Bearer 인증
- 툴은 위젯 액션과 1:1. 응답은 한국어 텍스트 + `structuredContent`, 오류는 `isError`, 입력은 zod 검증
- 서버 instructions에 스킬 규칙(확인 금지, 남은 문제 은폐 금지, 검증 한계)을 포함한다.
