import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "첫단추 차량시스템",
  description: "첫단추 영어학원 차량 스케줄 체크 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
