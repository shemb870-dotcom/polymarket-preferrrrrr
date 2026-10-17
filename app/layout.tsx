import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "事件镜 · 预测市场研究台",
  description: "看见市场变化，记录规则、证据与每一次判断。私人预测市场研究工作台。",
  manifest: "/manifest.webmanifest",
  themeColor: "#172d29",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "事件镜",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
