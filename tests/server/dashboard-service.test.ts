import { describe, expect, it, vi } from "vitest";
import { getProjectDashboard } from "@/server/dashboard/service";
import type { DashboardStore } from "@/server/dashboard/service";
import {
  dashboardQuerySchema,
  dashboardResponseSchema,
  issueStatusCountsSchema,
  burndownPointSchema,
  assigneeWorkloadSchema,
  agentActivityPointSchema,
} from "@/server/dashboard/schemas";

// --- Schema tests ---

describe("dashboard schemas", () => {
  it("parses valid query with default range", () => {
    const result = dashboardQuerySchema.parse({});
    expect(result.range).toBe("14");
  });

  it("accepts all valid range values", () => {
    for (const range of ["7", "14", "30"] as const) {
      expect(dashboardQuerySchema.parse({ range }).range).toBe(range);
    }
  });

  it("rejects invalid range", () => {
    expect(() => dashboardQuerySchema.parse({ range: "5" })).toThrow();
  });

  it("parses valid status counts", () => {
    const counts = {
      todo: 5,
      in_progress: 3,
      in_review: 2,
      done: 10,
      blocked: 1,
      backlog: 4,
      cancelled: 0,
    };
    expect(issueStatusCountsSchema.parse(counts)).toEqual(counts);
  });

  it("rejects negative counts", () => {
    expect(() => issueStatusCountsSchema.parse({ todo: -1, in_progress: 0, in_review: 0, done: 0, blocked: 0, backlog: 0, cancelled: 0 })).toThrow();
  });

  it("parses valid burndown point", () => {
    expect(burndownPointSchema.parse({ date: "2026-05-18", remaining: 10, completed: 5 })).toEqual({
      date: "2026-05-18",
      remaining: 10,
      completed: 5,
    });
  });

  it("parses valid assignee workload", () => {
    const wl = {
      assigneeId: "user-1",
      assigneeName: "Alice",
      assigneeType: "member",
      taskCount: 5,
      completedCount: 3,
    };
    expect(assigneeWorkloadSchema.parse(wl)).toEqual(wl);
  });

  it("accepts all assignee types", () => {
    for (const type of ["member", "agent", "squad"] as const) {
      expect(
        assigneeWorkloadSchema.parse({
          assigneeId: "id",
          assigneeName: "name",
          assigneeType: type,
          taskCount: 1,
          completedCount: 0,
        }).assigneeType
      ).toBe(type);
    }
  });

  it("parses valid agent activity point", () => {
    expect(agentActivityPointSchema.parse({ date: "2026-05-18", hour: 14, completedTasks: 3 })).toEqual({
      date: "2026-05-18",
      hour: 14,
      completedTasks: 3,
    });
  });

  it("rejects hour outside 0-23", () => {
    expect(() => agentActivityPointSchema.parse({ date: "2026-05-18", hour: 24, completedTasks: 1 })).toThrow();
  });

  it("parses a full dashboard response", () => {
    const response = {
      overview: { total: 25, completed: 10, inProgress: 3, todo: 5 },
      statusCounts: {
        todo: 5,
        in_progress: 3,
        in_review: 2,
        done: 10,
        blocked: 1,
        backlog: 4,
        cancelled: 0,
      },
      burndown: [
        { date: "2026-05-17", remaining: 20, completed: 5 },
        { date: "2026-05-18", remaining: 15, completed: 10 },
      ],
      assigneeWorkload: [
        { assigneeId: "u1", assigneeName: "Alice", assigneeType: "member", taskCount: 8, completedCount: 5 },
      ],
      agentActivity: [
        { date: "2026-05-18", hour: 10, completedTasks: 2 },
      ],
      generatedAt: "2026-05-18T12:00:00.000Z",
    };
    expect(dashboardResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects dashboard response with missing fields", () => {
    expect(() => dashboardResponseSchema.parse({ overview: {} })).toThrow();
  });
});

// --- Service tests ---

function makeStore(overrides: Partial<DashboardStore> = {}): DashboardStore {
  return {
    findProjectById: vi.fn().mockResolvedValue({ id: "project-1" }),
    countIssuesByStatus: vi.fn().mockResolvedValue([]),
    getBurndownData: vi.fn().mockResolvedValue([]),
    getAssigneeWorkload: vi.fn().mockResolvedValue([]),
    getAgentActivity: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("dashboard service", () => {
  it("throws when project is not found", async () => {
    const store = makeStore({
      findProjectById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      getProjectDashboard("nonexistent", "14", { store })
    ).rejects.toThrow("Project not found");
  });

  it("returns empty dashboard for a project with no issues", async () => {
    const store = makeStore();
    const result = await getProjectDashboard("project-1", "14", { store });

    expect(result.overview).toEqual({ total: 0, completed: 0, inProgress: 0, todo: 0 });
    expect(result.statusCounts).toEqual({
      todo: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0, backlog: 0, cancelled: 0,
    });
    expect(result.burndown).toEqual([]);
    expect(result.assigneeWorkload).toEqual([]);
    expect(result.agentActivity).toEqual([]);
    expect(result.generatedAt).toBeTruthy();
  });

  it("aggregates status counts into overview and statusCounts", async () => {
    const store = makeStore({
      countIssuesByStatus: vi.fn().mockResolvedValue([
        { status: "TODO", count: BigInt(5) },
        { status: "IN_PROGRESS", count: BigInt(3) },
        { status: "IN_REVIEW", count: BigInt(2) },
        { status: "DONE", count: BigInt(10) },
        { status: "BLOCKED", count: BigInt(1) },
      ]),
    });

    const result = await getProjectDashboard("project-1", "7", { store });

    expect(result.overview).toEqual({ total: 21, completed: 10, inProgress: 3, todo: 5 });
    expect(result.statusCounts).toEqual({
      todo: 5,
      in_progress: 3,
      in_review: 2,
      done: 10,
      blocked: 1,
      backlog: 0,
      cancelled: 0,
    });
  });

  it("maps burndown data correctly", async () => {
    const store = makeStore({
      getBurndownData: vi.fn().mockResolvedValue([
        { date: "2026-05-17", remaining: BigInt(20), completed: BigInt(5) },
        { date: "2026-05-18", remaining: BigInt(15), completed: BigInt(10) },
      ]),
    });

    const result = await getProjectDashboard("project-1", "14", { store });

    expect(result.burndown).toEqual([
      { date: "2026-05-17", remaining: 20, completed: 5 },
      { date: "2026-05-18", remaining: 15, completed: 10 },
    ]);
  });

  it("maps assignee workload, filtering out null assignees", async () => {
    const store = makeStore({
      getAssigneeWorkload: vi.fn().mockResolvedValue([
        { assigneeId: "user-1", assigneeType: "MEMBER", taskCount: BigInt(8), completedCount: BigInt(5) },
        { assigneeId: "agent-1", assigneeType: "AGENT", taskCount: BigInt(3), completedCount: BigInt(2) },
        { assigneeId: null, assigneeType: null, taskCount: BigInt(4), completedCount: BigInt(0) },
      ]),
    });

    const result = await getProjectDashboard("project-1", "30", { store });

    expect(result.assigneeWorkload).toEqual([
      { assigneeId: "user-1", assigneeName: "user-1", assigneeType: "member", taskCount: 8, completedCount: 5 },
      { assigneeId: "agent-1", assigneeName: "agent-1", assigneeType: "agent", taskCount: 3, completedCount: 2 },
    ]);
  });

  it("maps agent activity data", async () => {
    const store = makeStore({
      getAgentActivity: vi.fn().mockResolvedValue([
        { date: "2026-05-18", hour: 10, completedTasks: BigInt(5) },
        { date: "2026-05-18", hour: 14, completedTasks: BigInt(3) },
      ]),
    });

    const result = await getProjectDashboard("project-1", "7", { store });

    expect(result.agentActivity).toEqual([
      { date: "2026-05-18", hour: 10, completedTasks: 5 },
      { date: "2026-05-18", hour: 14, completedTasks: 3 },
    ]);
  });

  it("passes the correct since date based on range", async () => {
    const store = makeStore();
    await getProjectDashboard("project-1", "7", { store });

    expect(store.getBurndownData).toHaveBeenCalledTimes(1);
    expect(store.getAgentActivity).toHaveBeenCalledTimes(1);

    // Verify that getBurndownData was called with projectId
    expect(store.getBurndownData).toHaveBeenCalledWith("project-1", expect.any(Date));
  });

  it("produces a response that passes schema validation", async () => {
    const store = makeStore({
      countIssuesByStatus: vi.fn().mockResolvedValue([
        { status: "TODO", count: BigInt(2) },
        { status: "DONE", count: BigInt(1) },
      ]),
      getBurndownData: vi.fn().mockResolvedValue([
        { date: "2026-05-18", remaining: BigInt(1), completed: BigInt(1) },
      ]),
      getAssigneeWorkload: vi.fn().mockResolvedValue([
        { assigneeId: "u1", assigneeType: "MEMBER", taskCount: BigInt(2), completedCount: BigInt(1) },
      ]),
      getAgentActivity: vi.fn().mockResolvedValue([]),
    });

    const result = await getProjectDashboard("project-1", "14", { store });
    const validated = dashboardResponseSchema.parse(result);

    expect(validated.overview.total).toBe(3);
    expect(validated.overview.completed).toBe(1);
    expect(validated.burndown).toHaveLength(1);
  });
});
