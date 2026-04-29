import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Agent Marketplace",
  description: "Download validated Hermes-agent packages and inspect their skills and workflows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">Hermes Agents</Link>
          <nav>
            <Link href="/agents">智能体</Link>
            <Link href="/creator">创作者</Link>
            <Link href="/admin">管理</Link>
          </nav>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
