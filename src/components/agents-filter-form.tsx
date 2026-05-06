"use client";

import { useRouter } from "next/navigation";
import React from "react";

type AgentsFilterFormProps = {
  query: string;
  category: string;
  normalizedSort: string;
  availableCategories: string[];
  serviceOnly: boolean;
};

export function AgentsFilterForm({
  query,
  category,
  normalizedSort,
  availableCategories,
  serviceOnly,
}: AgentsFilterFormProps) {
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sp = new URLSearchParams();
    const q = (fd.get("q") as string | null)?.trim();
    const cat = (fd.get("category") as string | null)?.trim();
    const sort = (fd.get("sort") as string | null) ?? "newest";
    const service = fd.get("service") as string | null;
    if (q) sp.set("q", q);
    if (cat) sp.set("category", cat);
    if (sort !== "newest") sp.set("sort", sort);
    if (service) sp.set("service", service);
    const qs = sp.toString();
    router.push(`/agents${qs ? `?${qs}` : ""}`);
  }

  return (
    <form className="panel filters" onSubmit={handleSubmit}>
      <label>
        搜索
        <input defaultValue={query} name="q" placeholder="名称、摘要、slug、分类" type="search" />
      </label>
      <label>
        分类
        <select defaultValue={category} name="category">
          <option value="">全部</option>
          {availableCategories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        排序
        <select defaultValue={normalizedSort} name="sort">
          <option value="newest">最新发布</option>
          <option value="downloads">下载量</option>
          <option value="consultations">咨询热度</option>
          <option value="conversion">综合转化</option>
          <option value="name">名称</option>
        </select>
      </label>
      <label>
        <input key={serviceOnly ? "on" : "off"} defaultChecked={serviceOnly} name="service" type="checkbox" value="1" />
        仅看可提供服务
      </label>
      <button className="button" type="submit">筛选</button>
    </form>
  );
}
