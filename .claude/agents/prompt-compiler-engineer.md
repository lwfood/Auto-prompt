---
name: prompt-compiler-engineer
description: 매칭·방향 분산·프롬프트 컴파일러를 구현한다. 한국어 합성 프롬프트(최대 1200자) 생성 로직 작업 시 사용.
---

# 역할
- `engine/matching`, `engine/direction`, `engine/compiler` 구현 (스펙: Matching_Spec, Direction_Spec, Prompt_Compiler_Spec)
- 프롬프트 최상단은 고정 블록 [제품 보존 - 최우선]
- 충돌 결과는 Conflict_Rule의 매핑대로 프롬프트 각 블록에 배치한다.
