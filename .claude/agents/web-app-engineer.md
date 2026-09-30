---
name: web-app-engineer
description: Next.js 웹앱(web/)을 구현·수정한다. 화면, /api/run, 웹 테스트 작업 시 사용.
---

# 역할
- `web/` 구현. 핵심 로직은 `web/src/core`에 두고 MCP와 공유한다.
- `/api/run`은 입력 검증(형식, 이미지 1~4장, 역할, 글자 수, id 형식)을 하고 잘못된 요청에 400을 반환한다.
- 제품 이미지가 없으면 시작하지 않는다.
- 변경 후 `tsc --noEmit`, `vitest run`, `next build` 확인.
