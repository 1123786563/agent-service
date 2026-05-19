import type { Metadata } from "next";
import Link from "next/link";
import Nav from "./nav";
import { NotificationToast } from "@/components/notification-toast";
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
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">H</span>
            <span>Hermes Agents</span>
          </Link>
          <Nav />
        </header>
        <main className="page">{children}</main>
        <NotificationToast />
        <footer className="site-footer">
          <div className="footer-inner">
            <section className="footer-column">
              <h2>Support</h2>
              <Link href="/docs">导入说明</Link>
              <Link href="/services">服务流程</Link>
              <Link href="/account/orders">我的订单</Link>
            </section>
            <section className="footer-column">
              <h2>Hosting</h2>
              <Link href="/creator">创作者工作台</Link>
              <Link href="/creator/agents/new">发布新智能体</Link>
              <Link href="/creator/consultations">咨询列表</Link>
            </section>
            <section className="footer-column">
              <h2>Marketplace</h2>
              <Link href="/agents">智能体市场</Link>
              <Link href="/agents?service=1">可服务智能体</Link>
              <Link href="/admin">管理后台</Link>
            </section>
          </div>
          <div className="legal-band">
            <span>© 2026 Hermes Agent Marketplace</span>
            <div className="legal-links">
              <span>中文</span>
              <span>USD</span>
              <span>Validated ZIP packages</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
