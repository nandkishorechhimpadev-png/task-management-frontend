export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  user?: User;
  role: "ADMIN" | "MEMBER";
  joinedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  owner?: User;
  members: WorkspaceMember[];
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  workspaceId: string;
  createdById: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
};

export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  dueDate: string | null;
  projectId: string;
  parentTaskId: string | null;
  subtasks?: Task[];
  assigneeId: string | null;
  assignee?: User | null;
  createdById: string;
  createdBy?: User;
  comments?: Comment[];
  activityLogs?: ActivityLog[];
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: string;
  content: string;
  taskId: string;
  userId: string;
  user?: User;
  createdAt: string;
  updatedAt: string;
};

export type ActivityLog = {
  id: string;
  taskId: string;
  userId: string;
  user?: User;
  action:
    | "TASK_CREATED"
    | "TASK_UPDATED"
    | "TASK_DELETED"
    | "TASK_STATUS_CHANGED"
    | "TASK_ASSIGNED"
    | "TASK_PRIORITY_CHANGED"
    | "COMMENT_ADDED"
    | "COMMENT_UPDATED"
    | "COMMENT_DELETED";
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ApiResponse<T> = {
  success: true;
  data: T;
  timestamp: string;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type AuthPayload =
  | User
  | {
      user?: User;
      accessToken?: string;
      token?: string;
      refreshToken?: string;
    };
