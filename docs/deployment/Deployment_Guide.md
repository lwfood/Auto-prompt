# Deployment Guide

> 배포 플랫폼(C-06)이 **미정**이라 플랫폼 공통 절차만 적었습니다. 확정 후 해당 플랫폼 절을 추가하세요.

## 0. 사전 조건
- [ ] C-05 인증 방식 확정
- [ ] C-06 저장소·플랫폼 확정, 계정 준비(D-05)
- [ ] 실제 레퍼런스 이미지와 사용 권한 확보(D-02, C-03)
- [ ] Node.js / Python 버전 확정 (**확인 필요**)

## 1. 로컬 검증
```bash
# 웹앱
cd web && npm ci && npx tsc --noEmit && npx vitest run && npx next build

# MCP
cd mcp && npm ci && npx tsc --noEmit && npx vitest run

# 엔진
python3 engine/tests/test_engine.py && python3 engine/tests/test_pipeline.py
```
> 출력 폴더 마운트에서는 `npm install`이 실패할 수 있으니 **로컬 디스크**에서 실행하세요.

## 2. 웹앱 배포
1. 저장소에 푸시 (`node_modules`, `.next` 제외)
2. 플랫폼에서 빌드 명령 `next build`, 시작 명령 `next start`
3. 환경 변수 등록 (`Environment_Config.md`)
4. 배포 후 스모크 테스트: 제품 이미지 업로드 → 시안 생성 → 프롬프트 복사

## 3. MCP 서버 배포 (ChatGPT App 연동용)
1. 원격 HTTP 서버가 필요하므로 HTTPS와 도메인을 먼저 준비
2. `MCP_API_KEY`, `MCP_CORS_ORIGIN`, `PORT` 설정
3. 시작: `npm run start:http`
4. 확인: `GET /healthz` → `{"ok":true,"name":"reference-image-director","adapters":"mock"}`
5. `POST /mcp` 에 Bearer 없이 요청하면 **401**인지 확인

로컬 클라이언트(Claude Desktop 등)는 stdio로 연결합니다.
```json
{ "mcpServers": { "reference-image-director": { "command": "npx", "args": ["tsx", "/절대경로/mcp/src/stdio.ts"] } } }
```

## 4. 롤백
- 이전 배포 버전으로 되돌리고 `/healthz`와 스모크 테스트를 다시 확인
- MCP 상태는 메모리라 재시작하면 job이 사라짐 (데이터 마이그레이션 없음)
