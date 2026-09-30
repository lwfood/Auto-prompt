# Reference Image Director — 배포 패키지

제품 이미지를 올리면 레퍼런스 연출을 분석해 **제품 보존 조건이 담긴 영어 합성 프롬프트(최대 1200자)**를 만들고, 자동 생성·검증·교정(1회)을 거쳐 시안을 보여 주는 서비스의 배포 문서 모음입니다.

> **문서 상태:** 대화 기록(2026-09-28)에서 확인된 내용만으로 다시 정리한 최종본입니다. 확인되지 않은 항목은 `미정` 또는 `확인 필요`로 표시했습니다.

## 폴더 구성
| 경로 | 내용 | 상태 |
|---|---|---|
| `docs/deployment/` | 배포 문서 | 포함 |
| `web/` | Next.js 웹앱 (`/api/run` 포함) | **코드 별도 제공 필요** |
| `engine/` | Python 규칙·파이프라인 엔진 (`test_engine.py`, `test_pipeline.py`) | **코드 별도 제공 필요** |
| `mcp/` | MCP 서버 (툴 9개, stdio + Streamable HTTP) | **코드 별도 제공 필요** |
| `.env.example` | 환경 변수 예시 | 이 패키지에 포함 |

## 읽는 순서
1. `System_Architecture.md` — 전체 구조
2. `Environment_Config.md` — 환경 변수
3. `Deployment_Guide.md` — 배포 절차
4. `API_MCP_Spec.md` — 연동 규격
5. `QA_Validation_Spec.md` → `Release_Checklist.md` — 검증과 출시
6. `Decision_Log.md` — 확정·미결 사항 (**배포 전 반드시 확인**)

## 지금 배포를 막고 있는 결정
1. **C-05** 인증 방식 (SSO/OAuth vs API 키)
2. **C-06** GitHub 저장소 위치와 배포 플랫폼
3. **D-02 / C-03** 실제 레퍼런스 이미지와 사용 권한 (현재 테스트용 4장)
