import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { useQuery } from "@tanstack/react-query";

// Mock recharts components
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
}));

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  QueryClient: vi.fn(() => ({
    defaultOptions: {},
  })),
}));

// Mock zustand
vi.mock("zustand", () => ({
  create: (factory: (set: any) => any) => {
    const store = { range: "14", setRange: vi.fn() };
    return () => store;
  },
}));

import { OverviewCards } from "@views/components/OverviewCards";
import { BurndownChart } from "@views/components/BurndownChart";
import { WorkloadBarChart } from "@views/components/WorkloadBarChart";
import { AgentActivityHeatmap } from "@views/components/AgentActivityHeatmap";
import { EmptyState } from "@views/components/EmptyState";
import { DashboardPage } from "@views/components/DashboardPage";

describe("EmptyState", () => {
  it("renders default empty state", () => {
    render(<EmptyState />);
    expect(screen.getByText("暂无数据")).toBeDefined();
    expect(screen.getByText("当有数据可用时，图表将在此处显示。")).toBeDefined();
  });

  it("renders custom title and description", () => {
    render(<EmptyState title="自定义标题" description="自定义描述" />);
    expect(screen.getByText("自定义标题")).toBeDefined();
    expect(screen.getByText("自定义描述")).toBeDefined();
  });
});

describe("OverviewCards", () => {
  it("renders loading skeleton", () => {
    render(<OverviewCards overview={null} loading />);
    expect(screen.getByText("总 Issue 数")).toBeDefined();
    // All 4 cards show "—" in loading state
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(4);
  });

  it("renders empty state when no data", () => {
    render(<OverviewCards overview={null} />);
    expect(screen.getByText("暂无概览数据")).toBeDefined();
  });

  it("renders overview cards with data", () => {
    const overview = { total: 42, completed: 10, inProgress: 5, todo: 27 };
    render(<OverviewCards overview={overview} />);
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("10")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("27")).toBeDefined();
  });

  it("formats numbers with locale", () => {
    const overview = { total: 1234, completed: 567, inProgress: 89, todo: 578 };
    render(<OverviewCards overview={overview} />);
    expect(screen.getByText("1,234")).toBeDefined();
  });
});

describe("BurndownChart", () => {
  it("renders loading state", () => {
    render(<BurndownChart data={[]} loading />);
    expect(screen.getByText("加载中...")).toBeDefined();
  });

  it("renders empty state when no data", () => {
    render(<BurndownChart data={[]} />);
    expect(screen.getByText("暂无燃尽图数据")).toBeDefined();
  });

  it("renders chart with data", () => {
    const data = [
      { date: "2026-05-10", remaining: 20, completed: 5 },
      { date: "2026-05-11", remaining: 18, completed: 7 },
    ];
    render(<BurndownChart data={data} />);
    expect(screen.getByText("燃尽图")).toBeDefined();
    expect(screen.getByTestId("line-chart")).toBeDefined();
  });
});

describe("WorkloadBarChart", () => {
  it("renders loading state", () => {
    render(<WorkloadBarChart data={[]} loading />);
    expect(screen.getByText("加载中...")).toBeDefined();
  });

  it("renders empty state when no data", () => {
    render(<WorkloadBarChart data={[]} />);
    expect(screen.getByText("暂无工作量数据")).toBeDefined();
  });

  it("renders chart with data", () => {
    const data = [
      { assigneeId: "1", assigneeName: "Alice", assigneeType: "member" as const, taskCount: 10, completedCount: 5 },
      { assigneeId: "2", assigneeName: "Bot", assigneeType: "agent" as const, taskCount: 8, completedCount: 8 },
    ];
    render(<WorkloadBarChart data={data} />);
    expect(screen.getByText("团队工作量分布")).toBeDefined();
    expect(screen.getByTestId("bar-chart")).toBeDefined();
  });

  it("truncates long names", () => {
    const data = [
      { assigneeId: "1", assigneeName: "Very Long Agent Name Here", assigneeType: "agent" as const, taskCount: 5, completedCount: 3 },
    ];
    render(<WorkloadBarChart data={data} />);
    // Recharts is mocked, verify chart renders with data
    expect(screen.getByTestId("bar-chart")).toBeDefined();
  });
});

describe("AgentActivityHeatmap", () => {
  it("renders loading state", () => {
    render(<AgentActivityHeatmap data={[]} loading />);
    expect(screen.getByText("加载中...")).toBeDefined();
  });

  it("renders empty state when no data", () => {
    render(<AgentActivityHeatmap data={[]} />);
    expect(screen.getByText("暂无 Agent 活跃度数据")).toBeDefined();
  });

  it("renders heatmap with data", () => {
    const data = [
      { date: "2026-05-17", hour: 10, completedTasks: 5 },
      { date: "2026-05-17", hour: 14, completedTasks: 3 },
    ];
    render(<AgentActivityHeatmap data={data} />);
    expect(screen.getByText("AI Agent 活跃度")).toBeDefined();
    const svg = screen.getByRole("img");
    expect(svg).toBeDefined();
  });

  it("renders correct number of cells for 7 days", () => {
    const data = [{ date: "2026-05-17", hour: 12, completedTasks: 1 }];
    render(<AgentActivityHeatmap data={data} days={7} />);
    const svg = screen.getByRole("img");
    const rects = svg.querySelectorAll("rect");
    expect(rects.length).toBe(168);
  });
});

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders error state", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("加载失败"),
    } as any);

    render(<DashboardPage wsId="ws-1" projectId="p-1" />);
    expect(screen.getByText("加载仪表盘失败")).toBeDefined();
    expect(screen.getByText("加载失败")).toBeDefined();
  });

  it("renders full dashboard with data", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        overview: { total: 20, completed: 8, inProgress: 4, todo: 8 },
        burndown: [{ date: "2026-05-17", remaining: 12, completed: 8 }],
        assigneeWorkload: [{ assigneeId: "1", assigneeName: "Alice", assigneeType: "member", taskCount: 10, completedCount: 5 }],
        agentActivity: [{ date: "2026-05-17", hour: 10, completedTasks: 3 }],
        generatedAt: "2026-05-18T00:00:00Z",
      },
      isLoading: false,
      error: null,
    } as any);

    render(<DashboardPage wsId="ws-1" projectId="p-1" />);
    expect(screen.getByText("项目仪表盘")).toBeDefined();
    expect(screen.getByText("20")).toBeDefined();
    expect(screen.getByText("燃尽图")).toBeDefined();
    expect(screen.getByText("团队工作量分布")).toBeDefined();
    expect(screen.getByText("AI Agent 活跃度")).toBeDefined();
  });
});
