import React from "react";
import Link from "next/link";
import { WhitelistStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { UploadAgentForm } from "@/components/upload-agent-form";
import { getCurrentUser } from "@/server/auth/session";

export default async function NewAgentPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return (
      <section className="page-hero">
        <p className="eyebrow">Creator upload</p>
        <h1>上传智能体 ZIP</h1>
        <p className="lede">你的邮箱尚未进入白名单，暂时不能上传智能体 ZIP。</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Creator upload</p>
          <h1>上传智能体 ZIP</h1>
          <p className="lede">ZIP 必须包含 AGENTS.md、SOUL.md 和 README.md。团队包需要 TEAM.md。</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/creator">返回工作台</Link>
        </div>
      </div>

      <div className="panel upload-panel">
        <UploadAgentForm />
      </div>

      <section className="panel">
        <h2>上传前检查</h2>
        <div className="amenity-grid">
          <div className="amenity-item">
            <span className="amenity-icon">AG</span>
            <span>单 Agent 包必须包含 AGENTS.md、SOUL.md 和 README.md</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">TM</span>
            <span>团队包需要额外包含 TEAM.md</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">SK</span>
            <span>skill 和 workflow 路径必须真实存在</span>
          </div>
          <div className="amenity-item">
            <span className="amenity-icon">VAL</span>
            <span>平台会自动校验结构和 metadata</span>
          </div>
        </div>
      </section>
    </section>
  );
}
