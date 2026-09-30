# Environment Config

## MCP 서버 (`mcp/`)
| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MCP_API_KEY` | 원격 배포 시 필수 | 없음 | 설정하면 `Authorization: Bearer <키>` 요구, 호스트 `0.0.0.0`. 없으면 `127.0.0.1`에서만 열림 |
| `PORT` | 선택 | `3333` | HTTP 포트 |
| `MCP_CORS_ORIGIN` | 선택 | `*` | 허용 Origin. **운영에서는 실제 도메인으로 제한** |

- `MCP_API_KEY`는 C-05 확정 전 임시 방식입니다. SSO/OAuth로 정해지면 교체합니다.
- 키는 저장소에 커밋하지 않습니다 (`.env*`는 `.gitignore`).

## 웹앱 (`web/`)
- 필수 환경 변수: **확인 필요** (코드 확인 후 채울 것)
- 폰트(Pretendard)가 CDN 의존 → 배포 시 자체 호스팅으로 전환

## 엔진 (`engine/`)
- Python 3, `requirements.txt` 기준. 별도 환경 변수: **확인 필요**

## 비밀 값 관리
| 값 | 보관 위치 | 비고 |
|---|---|---|
| `MCP_API_KEY` | 배포 플랫폼의 시크릿 저장소 | 90일마다 교체 권장 |
| 이미지 생성·LLM API 키 | 어댑터 교체 시 추가 | 현재 없음 |
