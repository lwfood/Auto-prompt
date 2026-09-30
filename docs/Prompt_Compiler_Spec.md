# Prompt Compiler Spec (v0.1)

## 결정
- **프롬프트는 영어로 작성하고, 전체 합쳐서 최대 1200자**(네 블록 전체, 공백 포함)로 한다.
- 화면에는 영어 프롬프트 전문과 **한국어 요약(반영 사항)**을 함께 보여 준다.
- 범위: **연출컷 제작과 프롬프트 작성**. 썸네일 제작은 범위 밖이다.

## 블록 순서
1. `[PRODUCT INTEGRITY - TOP PRIORITY]` — 고정 블록, 최상단, 짧게 압축
2. `[SCENE - MATCH THE REFERENCE]` — 종횡비, 카메라 고도, 렌즈감, 조명, 그림자, 배경 구조, 단상
3. `[ADAPT]` — 배경·바닥 색, 오브제 (제품 이미지 기준)
4. `[EXCLUDE]` — 레퍼런스 제품·브랜드·글자·워터마크, 수량(1개), 사람·손(레퍼런스에 없을 때)

## 길이 규칙
- 1200자를 넘으면 [ADAPT]의 오브제 묘사부터 줄인다. [PRODUCT INTEGRITY]는 줄이지 않는다.
- 충돌 결과는 `rules/Conflict_Rule.md` §4대로 배치한다.

## 예시: TPROD01(꼬깔콘) × TREF04(초록 블록)  — 1046자
```
[PRODUCT INTEGRITY - TOP PRIORITY] Use the attached product image as the only source of the product. Reproduce it exactly: shape, proportions, seals, colors, every logo, all Korean and English text, illustrations and print, at 100% fidelity. Do not redraw, translate, add or remove any text or graphic. Show the front face clearly.
[SCENE - MATCH THE REFERENCE] Vertical 4:5 frame. Camera about 15 degrees above eye level, product centered on one dark green rectangular pedestal block. Same lens feel and depth of field as the reference. Hard warm key light from the upper right with soft dappled leaf-like shadows on a pale mint floor. Deep green gradient backdrop meeting the floor at the lower third.
[ADAPT] Keep the green backdrop and mint floor so the red bag stands out. Place a few corn kernels and two golden cone-shaped snacks on and around the pedestal, following the reference's prop placement.
[EXCLUDE] No reference cups, drinks, brand names, text, citrus slices, spices or corner watermark. Exactly one product. No people or hands.
```

## ChatGPT 내장 image_gen 흐름 (C-04 확답 필요)
서버는 최종 프롬프트와 이미지 역할(product, reference)을 반환하고, 생성 지시문·검증 체크리스트·교정 요청문(시안당 1회)을 제공한다.

## 확인 필요
- 한국어 요약(반영 사항) 문장 템플릿
