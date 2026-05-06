import type { Metadata } from "next";
import Link from "next/link";
import Nav from "./nav";
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
          <Nav />
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
