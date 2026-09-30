import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reference Image Director",
  description: "제품 이미지로 레퍼런스 연출 시안과 영어 합성 프롬프트를 만듭니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard CDN 의존 — 배포 시 자체 호스팅으로 전환 (Decision_Log 수용한 한계) */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
