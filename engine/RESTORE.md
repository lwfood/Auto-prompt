# engine/ — 복원 완료 (2026-09-30)

Python 3 표준 라이브러리만 사용 (외부 패키지 없음). TS 코어와 같은 규칙을 구현한 **규칙 검증용** 엔진.

- `rules/` 규칙 표·색 표·수정사항 검사·충돌 해결 (`package_classes.json`, `matching_weights.json`는 TS와 공유)
- `matching/`, `direction/`, `compiler/`, `pipeline.py` (mock 생성·검증)
- `tests/test_engine.py` 23개, `tests/test_pipeline.py` 10개 (총 33개)
- TS와의 일치: `tests/fixtures/golden/prompts.json`(TS가 생성)을 Python이 그대로 재현하는지 검사

```bash
python3 engine/tests/test_engine.py && python3 engine/tests/test_pipeline.py
```
`requirements.txt`는 확인 필요 항목이라 만들지 않았다 (현재 필요한 외부 패키지 없음).
