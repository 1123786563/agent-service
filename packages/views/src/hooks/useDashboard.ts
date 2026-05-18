"use client";

import { useQuery } from "@tanstack/react-query";
import { useDashboardStore } from "../store/dashboardStore";
import type { DashboardResponse } from "../types";

async function fetchDashboard(
  wsId: string,
  projectId: string,
  range: string
): Promise<DashboardResponse> {
  const res = await fetch(
    `/api/workspaces/${wsId}/projects/${projectId}/dashboard?range=${range}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.errors?.[0] ?? `请求失败 (${res.status})`);
  }
  return res.json();
}

export function useDashboard(wsId: string, projectId: string) {
  const range = useDashboardStore((s) => s.range);
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard", wsId, projectId, range],
    queryFn: () => fetchDashboard(wsId, projectId, range),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
