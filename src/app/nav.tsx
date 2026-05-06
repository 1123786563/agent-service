"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/agents", label: "智能体" },
  { href: "/services", label: "服务" },
  { href: "/docs", label: "文档" },
  { href: "/creator", label: "创作者" },
  { href: "/admin", label: "管理" },
] as const;

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={pathname.startsWith(href) ? "active" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
