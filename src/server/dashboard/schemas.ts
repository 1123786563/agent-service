import { z } from "zod";

export const dashboardQuerySchema = z.object({
  range: z.enum(["7", "14", "30"]).default("14"),
});

export const issueStatusCountsSchema = z.object({
  todo: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  in_review: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  backlog: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

export const burndownPointSchema = z.object({
  date: z.string(),
  remaining: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export const assigneeWorkloadSchema = z.object({
  assigneeId: z.string(),
  assigneeName: z.string(),
  assigneeType: z.enum(["member", "agent", "squad"]),
  taskCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
});

export const agentActivityPointSchema = z.object({
  date: z.string(),
  hour: z.number().int().min(0).max(23),
  completedTasks: z.number().int().nonnegative(),
});

export const dashboardResponseSchema = z.object({
  overview: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    todo: z.number().int().nonnegative(),
  }),
  statusCounts: issueStatusCountsSchema,
  burndown: z.array(burndownPointSchema),
  assigneeWorkload: z.array(assigneeWorkloadSchema),
  agentActivity: z.array(agentActivityPointSchema),
  generatedAt: z.string(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type IssueStatusCounts = z.infer<typeof issueStatusCountsSchema>;
export type BurndownPoint = z.infer<typeof burndownPointSchema>;
export type AssigneeWorkload = z.infer<typeof assigneeWorkloadSchema>;
export type AgentActivityPoint = z.infer<typeof agentActivityPointSchema>;
