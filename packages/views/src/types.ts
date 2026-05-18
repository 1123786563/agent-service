export interface DashboardOverview {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  completed: number;
}

export interface AssigneeWorkload {
  assigneeId: string;
  assigneeName: string;
  assigneeType: "member" | "agent" | "squad";
  taskCount: number;
  completedCount: number;
}

export interface AgentActivityPoint {
  date: string;
  hour: number;
  completedTasks: number;
}

export interface DashboardResponse {
  overview: DashboardOverview;
  statusCounts: {
    todo: number;
    in_progress: number;
    in_review: number;
    done: number;
    blocked: number;
    backlog: number;
    cancelled: number;
  };
  burndown: BurndownPoint[];
  assigneeWorkload: AssigneeWorkload[];
  agentActivity: AgentActivityPoint[];
  generatedAt: string;
}

export type DateRange = "7" | "14" | "30";
