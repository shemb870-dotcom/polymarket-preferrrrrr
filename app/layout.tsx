import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "事件镜 · 预测市场研究台",
  description: "看见市场变化，记录规则、证据与每一次判断。私人预测市场研究工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
