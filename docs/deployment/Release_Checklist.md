# Release Checklist

## A. 결정·준비
- [ ] C-05 인증 방식 확정
- [ ] C-06 저장소·배포 플랫폼 확정, 계정 준비
- [ ] D-02 실제 레퍼런스 이미지 교체, C-03 출처·사용 권한 확인
- [ ] 어댑터 5곳 실제 구현으로 교체 여부 결정 (mock 상태로 출시하면 안내 문구 필요)

## B. 코드
- [ ] `tsc --noEmit` 통과 (web, mcp)
- [ ] 자동 테스트 전부 통과 (web, mcp, engine)
- [ ] `next build` 성공
- [ ] Playwright 흐름 검증 통과
- [ ] `npm audit --omit=dev` 프로덕션 취약점 없음

## C. 설정·보안
- [ ] `MCP_API_KEY` 시크릿 등록, 저장소에 키 없음
- [ ] `MCP_CORS_ORIGIN`을 실제 도메인으로 제한
- [ ] HTTPS·도메인 적용
- [ ] Pretendard 폰트 자체 호스팅

## D. 배포 후
- [ ] `GET /healthz` 정상
- [ ] 인증 없는 `POST /mcp` → 401
- [ ] 웹 스모크: 업로드 → 시안 → 프롬프트 복사
- [ ] ChatGPT Enterprise에서 개인 테스트 (17단계)
- [ ] 롤백 절차 확인

## E. 공지
- [ ] 알려진 한계(mock 여부, 서버 전역 추천 제외) 사용자에게 안내
