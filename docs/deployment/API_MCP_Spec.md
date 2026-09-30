# API / MCP Spec

## 1. MCP 엔드포인트
| 항목 | 값 |
|---|---|
| 전송 | stdio, Streamable HTTP |
| HTTP 경로 | `POST /mcp`, `GET /healthz` |
| 세션 | 요청마다 독립(stateless) |
| 인증 | `Authorization: Bearer <MCP_API_KEY>` (키 설정 시) |
| 오류 | 인증 실패 401 (`www-authenticate: Bearer`), 경로 오류 404, POST 외 405 |

## 2. 툴 (9개, 위젯 액션과 1:1)
| 툴 | 역할 | 읽기 전용 |
|---|---|---|
| `create_drafts` | 만들기. 레퍼런스 없음 → 방향별 시안(USP 있음 3개, 없음 2개), 지정 → 1개. `mode="prompt_only"`는 프롬프트만 | X |
| `get_draft` | 프롬프트 전문, 반영 사항·배경색·검증·남은 문제 | O |
| `suggest_alternatives` | 교체 모달의 대안 3개 (`other_directions`로 확장) | O |
| `swap_reference` | 한 시안의 레퍼런스만 교체해 다시 생성 | X |
| `regenerate_with_notes` | 수정사항을 넣어 다시 생성 (`draft_index`로 한 시안만) | X |
| `set_reference_excluded` | 추천 제외 토글 (멱등) | X |
| `search_references` | 레퍼런스 조회·검색 | O |
| `get_reference` | 레퍼런스 상세 | O |
| `get_rules` | 제품 보존 규칙 전체 | O |

## 3. 응답 규칙
- 사람이 읽는 한국어 텍스트 + `structuredContent`(위젯용)
- 오류는 `isError`, 입력은 zod 스키마로 검증 (id 형식, 200자 제한 등)
- 서버 `instructions`: 생성 시작 확인을 묻지 않음 / 남은 문제를 숨기지 않음 / 실제 치수·인쇄 일치를 검증했다고 말하지 않음

## 4. 웹 API
`POST /api/run` — 요청 실행
- 입력 검증: 형식, **이미지 1~4장**, 역할, 글자 수, id 형식
- 잘못된 요청은 **400**
- 제품 이미지가 없으면 시작하지 않음

## 5. 반영됨 (2026-09-30)
- `create_drafts` 입력에 **`usp`(선택, 문자열)** 추가 — 구현됨
- 프롬프트는 영어, 최대 1200자
- 수량 배지·썸네일 관련 항목은 범위 밖이라 두지 않는다

## 6. 미구현
- ChatGPT App용 **결과 기록 툴** (ChatGPT가 생성한 이미지의 검증·교정 결과 저장)

## 7. 입력 스키마 (코드 기준: `mcp/src/server.ts`, `web/src/lib/run.ts`)
- `images`: 1~4개, `{ role: "product"|"reference", test_id?: "TPROD00", data_url?: "data:image/(png|jpeg|webp);base64,…", name? }` — test_id와 data_url 중 하나
- `usp`, 수정사항 각 1~200자, 수정사항 최대 5개, `reference_id`: `TREF00`, `aspect`: `"4:5"` 형식, `draft_index`: 0~2, `job_id`: UUID
- `/api/run`: `action` = `create` | `regenerate`(draft {index, direction, reference_id} 필요) | `alternatives`(current_reference_id), `excluded`로 추천 제외 목록 전달 (웹은 서버 상태 없음)
- `/api/run` 응답: 200, 입력 오류 400, 재작업 생성 실패 502(실패 시안 포함), 그 외 500
