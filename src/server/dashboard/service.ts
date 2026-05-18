import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type {
  BurndownPoint,
  AgentActivityPoint,
  AssigneeWorkload,
  IssueStatusCounts,
  DashboardResponse,
} from "./schemas";

type StatusCountRow = { status: string; count: bigint };

type BurndownRow = {
  date: string;
  remaining: bigint;
  completed: bigint;
};

type WorkloadRow = {
  assigneeId: string | null;
  assigneeType: string | null;
  taskCount: bigint;
  completedCount: bigint;
};

type ActivityRow = {
  date: string;
  hour: number;
  completedTasks: bigint;
};

export type DashboardStore = {
  countIssuesByStatus(projectId: string): Promise<StatusCountRow[]>;
  getBurndownData(projectId: string, since: Date): Promise<BurndownRow[]>;
  getAssigneeWorkload(projectId: string): Promise<WorkloadRow[]>;
  getAgentActivity(projectId: string, since: Date): Promise<ActivityRow[]>;
  findProjectById(id: string): Promise<{ id: string } | null>;
};

type DashboardServiceDeps = {
  store: DashboardStore;
};

const defaultStore: DashboardStore = {
  countIssuesByStatus(projectId: string) {
    return prisma.$queryRaw`
      SELECT status, COUNT(*)::bigint as count
      FROM "ProjectIssue"
      WHERE "projectId" = ${projectId}
      GROUP BY status
    `;
  },

  getBurndownData(projectId: string, since: Date) {
    return prisma.$queryRaw`
      WITH days AS (
        SELECT generate_series(
          ${since}::date,
          NOW()::date,
          '1 day'::interval
        )::date AS date
      ),
      cumulative AS (
        SELECT
          d.date,
          COUNT(i.id)::bigint FILTER (WHERE i.status != 'DONE' AND i.status != 'CANCELLED' AND i."createdAt" <= d.date + interval '1 day') AS remaining,
          COUNT(i.id)::bigint FILTER (WHERE i.status = 'DONE' AND i."completedAt" <= d.date + interval '1 day') AS completed
        FROM days d
        LEFT JOIN "ProjectIssue" i ON i."projectId" = ${projectId}
        GROUP BY d.date
      )
      SELECT date::text AS date, COALESCE(remaining, 0) AS remaining, COALESCE(completed, 0) AS completed
      FROM cumulative
      ORDER BY date
    `;
  },

  getAssigneeWorkload(projectId: string) {
    return prisma.$queryRaw`
      SELECT
        "assigneeId",
        "assigneeType"::text,
        COUNT(*)::bigint AS "taskCount",
        COUNT(*) FILTER (WHERE status = 'DONE')::bigint AS "completedCount"
      FROM "ProjectIssue"
      WHERE "projectId" = ${projectId}
      GROUP BY "assigneeId", "assigneeType"
    `;
  },

  getAgentActivity(projectId: string, since: Date) {
    return prisma.$queryRaw`
      SELECT
        ("completedAt"::date)::text AS date,
        EXTRACT(HOUR FROM "completedAt")::int AS hour,
        COUNT(*)::bigint AS "completedTasks"
      FROM "ProjectIssue"
      WHERE "projectId" = ${projectId}
        AND status = 'DONE'
        AND "completedAt" >= ${since}
        AND "assigneeType" = 'AGENT'
      GROUP BY "completedAt"::date, EXTRACT(HOUR FROM "completedAt")
      ORDER BY date, hour
    `;
  },

  findProjectById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
  },
};

const defaultDeps: DashboardServiceDeps = {
  store: defaultStore,
};

const STATUS_KEY_MAP: Record<string, keyof IssueStatusCounts> = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  IN_REVIEW: "in_review",
  DONE: "done",
  BLOCKED: "blocked",
  BACKLOG: "backlog",
  CANCELLED: "cancelled",
};

function buildStatusCounts(rows: StatusCountRow[]): IssueStatusCounts {
  const counts: IssueStatusCounts = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    blocked: 0,
    backlog: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    const key = STATUS_KEY_MAP[row.status];
    if (key) {
      counts[key] = Number(row.count);
    }
  }

  return counts;
}

function buildBurndown(rows: BurndownRow[]): BurndownPoint[] {
  return rows.map((row) => ({
    date: row.date,
    remaining: Number(row.remaining),
    completed: Number(row.completed),
  }));
}

function buildWorkload(rows: WorkloadRow[]): AssigneeWorkload[] {
  return rows
    .filter((row) => row.assigneeId !== null)
    .map((row) => ({
      assigneeId: row.assigneeId!,
      assigneeName: row.assigneeId!,
      assigneeType: (row.assigneeType?.toLowerCase() ?? "member") as AssigneeWorkload["assigneeType"],
      taskCount: Number(row.taskCount),
      completedCount: Number(row.completedCount),
    }));
}

function buildAgentActivity(rows: ActivityRow[]): AgentActivityPoint[] {
  return rows.map((row) => ({
    date: row.date,
    hour: row.hour,
    completedTasks: Number(row.completedTasks),
  }));
}

export async function getProjectDashboard(
  projectId: string,
  range: "7" | "14" | "30" = "14",
  deps: DashboardServiceDeps = defaultDeps
): Promise<DashboardResponse> {
  const project = await deps.store.findProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const rangeDays = parseInt(range, 10);
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  const [statusRows, burndownRows, workloadRows, activityRows] = await Promise.all([
    deps.store.countIssuesByStatus(projectId),
    deps.store.getBurndownData(projectId, since),
    deps.store.getAssigneeWorkload(projectId),
    deps.store.getAgentActivity(projectId, since),
  ]);

  const statusCounts = buildStatusCounts(statusRows);
  const overview = {
    total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    completed: statusCounts.done,
    inProgress: statusCounts.in_progress,
    todo: statusCounts.todo,
  };

  return {
    overview,
    statusCounts,
    burndown: buildBurndown(burndownRows),
    assigneeWorkload: buildWorkload(workloadRows),
    agentActivity: buildAgentActivity(activityRows),
    generatedAt: new Date().toISOString(),
  };
}
