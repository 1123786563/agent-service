"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";

const productLinks = [
  { href: "/agents", label: "智能体", icon: "A", badge: undefined },
  { href: "/services", label: "服务", icon: "S", badge: "NEW" },
  { href: "/docs", label: "文档", icon: "D", badge: "NEW" },
] as const;

const utilityLinks = [
  { href: "/creator", label: "创作者中心", admin: false },
  { href: "/account/orders", label: "订单", admin: false },
  { href: "/admin", label: "管理", admin: true },
] as const;

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="top-nav" aria-label="Marketplace sections">
        {productLinks.map(({ href, label, icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={pathname.startsWith(href) ? "active" : undefined}
            data-badge={badge}
            data-icon={icon}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav className="utility-nav" aria-label="Account and admin">
        <NotificationBell />
        {utilityLinks.map(({ href, label, admin }) => (
          <Link
            key={href}
            href={href}
            className={[
              "nav-link",
              admin ? "admin-link" : "",
              pathname.startsWith(href) ? "active" : "",
            ].filter(Boolean).join(" ")}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
