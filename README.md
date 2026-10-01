# Reference Image Director

제품 이미지를 올리면 레퍼런스 연출을 분석해 **제품 보존 조건이 담긴 한국어 합성 프롬프트(최대 1200자)**를 만들고, 자동 생성·검증·교정(1회)을 거쳐 시안을 보여 주는 서비스입니다. 스킬 `auto-prompt-to-img`의 워크플로우를 웹앱과 MCP 서버로 옮긴 프로젝트입니다.

## 폴더 구조
| 경로 | 내용 | 상태 |
|---|---|---|
| `CLAUDE.md` | Claude Code용 프로젝트 지침 | 포함 |
| `.claude/agents/` | 역할별 에이전트 9개 | 복원본(역할 기준 재작성) |
| `docs/` | 기획·규칙·명세·결정 기록 | 일부 복원, 일부 골격 (아래 표 참고) |
| `web/` | Next.js 웹앱 (`src/core`는 MCP와 공유), 화면은 Figma 정리안 S1·S2·S3·W4 | vitest 65, 브라우저 데모 `demo/` |
| `engine/` | 매칭·방향·컴파일러·규칙 엔진 (Python) | 테스트 36 (TS와 golden 일치) |
| `mcp/` | MCP 서버 (툴 9개, stdio + Streamable HTTP) | 복원 완료, vitest 18 |
| `references/` | 레퍼런스 라이브러리 (`library.json`, 이미지) | 테스트용 4장 등록 (분석값 초안) |
| `tests/` | 통합 테스트, `fixtures/products/` 테스트 제품 4종 | 제품 자료 포함 |

## 문서 복원 상태
| 상태 | 문서 |
|---|---|
| 대화 기록으로 복원 | `Conflict_Rule.md`, `System_Architecture.md`, `Decision_Log.md`, `deployment/*` |
| 요약 복원 | `PRD.md`, `Workflow_Spec.md` |
| 2026-09-30 답변으로 새로 작성 | `Core_Rule.md`, `Transformer_Rule.md`, `Reference_Library_Spec.md`, `Matching_Spec.md`, `Direction_Spec.md`, `Prompt_Compiler_Spec.md`, `QA_Validation.md` |
| 골격 (내용 채우기 필요) | `User_Flow.md` |

`확인 필요` 표시는 원본을 확인하지 못한 항목입니다. 추측으로 채우지 않았습니다.

## 시연
```bash
cd web && npm ci && npm run dev          # http://localhost:3000 (Next.js, /api/run 사용)
cd web && npm run demo:build             # web/demo/dist/index.html — 서버 없이 브라우저에서 core 실행
```
흐름: S1 입력(샘플 제품으로 체험하기 가능) → S2 시안 프롬프트(복사·레퍼런스 이미지 받기·오브제/색상 수정) → ChatGPT에서 이미지 생성.
S1 하단 "시연 설정"을 켜면 이미지 API 연결 화면(S3)을 볼 수 있다. 어댑터가 mock이라 실제 이미지는 만들지 않는다.

## 검증 명령
```bash
(cd web && npm ci && npx tsc --noEmit && npx vitest run && npx next build)
(cd mcp && npm ci && npx tsc --noEmit && npx vitest run)
python3 engine/tests/test_engine.py && python3 engine/tests/test_pipeline.py
```
남은 질문은 `docs/Decision_Log.md`의 확인 필요 목록(Q-xx).

## 배포 전 결정 (Decision_Log 참고)
C-05 인증 방식, C-06 저장소·배포 플랫폼, D-02 실제 레퍼런스 이미지, C-03 사용 권한.
