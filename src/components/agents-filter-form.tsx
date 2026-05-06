"use client";

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
  return (
    <form action="/agents" className="panel filters" method="get" onSubmit={(e) => {
      const form = e.currentTarget;
      e.preventDefault();
      const sp = new URLSearchParams();
      const data = new FormData(form);
      for (const [key, value] of data.entries()) {
        if (key === "sort" && value === "newest") continue;
        if (value) sp.set(key, value.toString());
      }
      window.location.href = `/agents${sp.toString() ? `?${sp.toString()}` : ""}`;
    }}>
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
