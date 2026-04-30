import React from "react";
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
      <section className="panel">
        <h1>上传智能体 ZIP</h1>
        <p className="lede">你的邮箱尚未进入白名单，暂时不能上传智能体 ZIP。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h1>上传智能体 ZIP</h1>
      <p className="lede">ZIP 必须包含 agent.json 和 README.md，并引用真实存在的 skill 与 workflow 文件。</p>
      <UploadAgentForm />
    </section>
  );
}
