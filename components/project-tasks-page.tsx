"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, asArray, getDisplayName, getErrorMessage, getStoredToken } from "@/lib/api";
import type { PaginatedResult, Project, Task, TaskPriority, TaskStatus, User, Workspace } from "@/lib/types";
import { EmptyState, Field, StatusMessage } from "@/components/ui";

type TaskForm = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  parentTaskId: string;
};

type TaskMeta = PaginatedResult<Task>["meta"];

type TaskNode = Omit<Task, "subtasks"> & { subtasks: TaskNode[] };

const defaultMeta: TaskMeta = { total: 0, page: 1, limit: 10, totalPages: 1 };
const defaultTaskForm: TaskForm = {
  title: "",
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  dueDate: "",
  parentTaskId: "",
};

const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
const taskPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function ProjectTasksPage({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<TaskMeta>(defaultMeta);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [form, setForm] = useState<TaskForm>(defaultTaskForm);
  const [showForm, setShowForm] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const taskTree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const flatTaskOptions = useMemo(() => flattenTaskTree(taskTree), [taskTree]);
  const statusCounts = useMemo(() => taskStatuses.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length })), [tasks]);

  const showToast = useCallback((message: string, isError = false) => {
    setNotice(isError ? "" : message);
    setError(isError ? message : "");
  }, []);

  const loadTasks = useCallback(
    async (authToken = token, nextPage = page, nextLimit = limit) => {
      setIsLoadingTasks(true);
      try {
        const query = new URLSearchParams({ page: String(nextPage), limit: String(nextLimit) });
        const payload = await apiRequest<Task[] | PaginatedResult<Task>>(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks?${query.toString()}`,
          { method: "GET" },
          authToken,
        );

        if (Array.isArray(payload)) {
          setTasks(payload);
          setMeta({ total: payload.length, page: nextPage, limit: nextLimit, totalPages: Math.max(1, Math.ceil(payload.length / nextLimit)) });
        } else {
          setTasks(asArray(payload));
          setMeta(payload.meta);
        }
      } finally {
        setIsLoadingTasks(false);
      }
    },
    [limit, page, projectId, token, workspaceId],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootProject() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        if (isMounted) {
          setError("Please login from the dashboard before opening project tasks.");
          setIsBooting(false);
        }
        return;
      }

      try {
        const [me, workspacePayload, projectPayload, tasksPayload] = await Promise.all([
          apiRequest<User>("/api/v1/auth/me", { method: "GET" }, storedToken),
          apiRequest<Workspace>(`/api/v1/workspaces/${workspaceId}`, { method: "GET" }, storedToken),
          apiRequest<Project>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`, { method: "GET" }, storedToken),
          apiRequest<Task[] | PaginatedResult<Task>>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks?page=1&limit=${limit}`, { method: "GET" }, storedToken),
        ]);

        if (!isMounted) return;
        setToken(storedToken);
        setUser(me);
        setWorkspace(workspacePayload);
        setProject(projectPayload);
        if (Array.isArray(tasksPayload)) {
          setTasks(tasksPayload);
          setMeta({ total: tasksPayload.length, page: 1, limit, totalPages: Math.max(1, Math.ceil(tasksPayload.length / limit)) });
        } else {
          setTasks(tasksPayload.data);
          setMeta(tasksPayload.meta);
        }
      } catch (caughtError) {
        if (isMounted) showToast(getErrorMessage(caughtError), true);
      } finally {
        if (isMounted) setIsBooting(false);
      }
    }

    void bootProject();
    return () => {
      isMounted = false;
    };
  }, [limit, projectId, showToast, workspaceId]);

  const goToPage = async (nextPage: number) => {
    const safePage = Math.min(Math.max(nextPage, 1), Math.max(meta.totalPages, 1));
    setPage(safePage);
    try {
      await loadTasks(token, safePage, limit);
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    }
  };

  const changeLimit = async (nextLimit: number) => {
    setLimit(nextLimit);
    setPage(1);
    try {
      await loadTasks(token, 1, nextLimit);
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    }
  };

  const openCreateTask = (parentTaskId = "") => {
    setForm({ ...defaultTaskForm, parentTaskId });
    setShowForm(true);
  };

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      await apiRequest<Task>(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          status: form.status,
          priority: form.priority,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
          parentTaskId: form.parentTaskId || null,
          position: meta.total + 1,
        }),
      }, token);

      setForm(defaultTaskForm);
      setShowForm(false);
      await loadTasks(token, page, limit);
      showToast(form.parentTaskId ? "Subtask created." : "Task created.");
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isBooting) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6"><p className="text-sm text-slate-300">Loading project tasks…</p></div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/" className="text-sm font-black text-blue-600 transition hover:text-blue-800">← Back to dashboard</Link>
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-slate-400">{workspace?.name ?? "Workspace"}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-5xl">{project?.name ?? "Project tasks"}</h1>
            <p className="mt-3 max-w-2xl text-slate-600">Tasks are shown in a paginated table. Nested subtasks render recursively beneath their parent.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">{getDisplayName(user)}</span>
            <button type="button" onClick={() => openCreateTask()} className="btn-primary">Create new task</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <StatusMessage notice={notice} error={error} />
        <div className="grid gap-4 md:grid-cols-4">
          {statusCounts.map((item) => <div key={item.status} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-3xl font-black">{item.count}</p><p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-400">{formatStatus(item.status)}</p></div>)}
        </div>

        {showForm && <TaskFormPanel form={form} taskOptions={flatTaskOptions} isSubmitting={isSubmitting} setForm={setForm} onCancel={() => { setShowForm(false); setForm(defaultTaskForm); }} onSubmit={submitTask} />}

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-950 p-5 text-white md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">Task table</p>
              <h2 className="mt-1 text-2xl font-black">{meta.total} total tasks</h2>
            </div>
            <label className="flex items-center gap-3 text-sm font-bold text-slate-300">
              Rows
              <select value={limit} onChange={(event) => void changeLimit(Number(event.target.value))} className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none">
                {[5, 10, 20, 50].map((option) => <option key={option} value={option} className="text-slate-950">{option}</option>)}
              </select>
            </label>
          </div>

          {isLoadingTasks ? <EmptyState title="Loading tasks" description="Fetching a fresh page of tasks." /> : taskTree.length === 0 ? <div className="p-6"><EmptyState title="No tasks yet" description="Create a task or subtask to start tracking execution." /></div> : <TaskTable tasks={taskTree} onAddSubtask={openCreateTask} />}

          <Pagination meta={meta} page={page} onPageChange={goToPage} />
        </div>
      </section>
    </main>
  );
}

function TaskFormPanel({ form, taskOptions, isSubmitting, setForm, onCancel, onSubmit }: { form: TaskForm; taskOptions: Array<{ id: string; title: string; depth: number }>; isSubmitting: boolean; setForm: (form: TaskForm) => void; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">New task</p><h2 className="text-2xl font-black">{form.parentTaskId ? "Create subtask" : "Create task"}</h2></div><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button></div>
      <div className="grid gap-4 md:grid-cols-2"><Field label="Title" light><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="input-light" placeholder="Write launch checklist" /></Field><Field label="Parent task" light><select value={form.parentTaskId} onChange={(event) => setForm({ ...form, parentTaskId: event.target.value })} className="input-light"><option value="">None — top-level task</option>{taskOptions.map((task) => <option key={task.id} value={task.id}>{`${"— ".repeat(task.depth)}${task.title}`}</option>)}</select></Field><Field label="Status" light><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })} className="input-light">{taskStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></Field><Field label="Priority" light><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })} className="input-light">{taskPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></Field><Field label="Due date" light><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="input-light" /></Field><Field label="Description" light><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-light min-h-28 resize-none" placeholder="Add acceptance criteria or context…" /></Field></div>
      <button type="submit" disabled={isSubmitting} className="mt-5 btn-primary">{isSubmitting ? "Creating…" : form.parentTaskId ? "Create subtask" : "Create task"}</button>
    </form>
  );
}

function TaskTable({ tasks, onAddSubtask }: { tasks: TaskNode[]; onAddSubtask: (parentTaskId: string) => void }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-5 py-4">Task</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Priority</th><th className="px-5 py-4">Assignee</th><th className="px-5 py-4">Due</th><th className="px-5 py-4">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{tasks.map((task) => <TaskRow key={task.id} task={task} depth={0} onAddSubtask={onAddSubtask} />)}</tbody></table></div>;
}

function TaskRow({ task, depth, onAddSubtask }: { task: TaskNode; depth: number; onAddSubtask: (parentTaskId: string) => void }) {
  return <><tr className="align-top transition hover:bg-slate-50"><td className="px-5 py-4"><div style={{ paddingLeft: `${depth * 24}px` }}><div className="flex items-center gap-2"><span className="text-slate-300">{depth > 0 ? "↳" : ""}</span><p className="font-black text-slate-950">{task.title}</p></div><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{task.description || "No description."}</p>{task.subtasks.length > 0 && <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-blue-500">{task.subtasks.length} subtask{task.subtasks.length === 1 ? "" : "s"}</p>}</div></td><td className="px-5 py-4"><StatusBadge status={task.status} /></td><td className="px-5 py-4"><PriorityBadge priority={task.priority} /></td><td className="px-5 py-4 text-sm font-semibold text-slate-600">{task.assignee ? getDisplayName(task.assignee) : "Unassigned"}</td><td className="px-5 py-4 text-sm font-semibold text-slate-600">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"}</td><td className="px-5 py-4"><button type="button" onClick={() => onAddSubtask(task.id)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-100">Add subtask</button></td></tr>{task.subtasks.map((subtask) => <TaskRow key={subtask.id} task={subtask} depth={depth + 1} onAddSubtask={onAddSubtask} />)}</>;
}

function Pagination({ meta, page, onPageChange }: { meta: TaskMeta; page: number; onPageChange: (page: number) => Promise<void> }) {
  return <div className="flex flex-col gap-4 border-t border-slate-200 p-5 md:flex-row md:items-center md:justify-between"><p className="text-sm font-semibold text-slate-500">Page {page} of {Math.max(meta.totalPages, 1)} · {meta.total} tasks</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => void onPageChange(page - 1)} className="btn-secondary !px-4 !py-2 text-sm">Previous</button><button type="button" disabled={page >= Math.max(meta.totalPages, 1)} onClick={() => void onPageChange(page + 1)} className="btn-secondary !px-4 !py-2 text-sm">Next</button></div></div>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const styles: Record<TaskStatus, string> = { TODO: "bg-slate-100 text-slate-700", IN_PROGRESS: "bg-blue-100 text-blue-700", IN_REVIEW: "bg-amber-100 text-amber-700", DONE: "bg-emerald-100 text-emerald-700" };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status]}`}>{formatStatus(status)}</span>;
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, string> = { LOW: "bg-slate-100 text-slate-600", MEDIUM: "bg-blue-100 text-blue-700", HIGH: "bg-orange-100 text-orange-700", URGENT: "bg-red-100 text-red-700" };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[priority]}`}>{priority}</span>;
}

function formatStatus(status: TaskStatus) {
  return status.replaceAll("_", " ");
}

function buildTaskTree(tasks: Task[]): TaskNode[] {
  const nodes = new Map<string, TaskNode>();
  const roots: TaskNode[] = [];

  for (const task of tasks) {
    nodes.set(task.id, { ...task, subtasks: [] });
  }

  for (const task of tasks) {
    const node = nodes.get(task.id);
    if (!node) continue;

    const nestedSubtasks = task.subtasks ?? [];
    for (const subtask of nestedSubtasks) {
      if (!nodes.has(subtask.id)) nodes.set(subtask.id, { ...subtask, subtasks: [] });
      node.subtasks.push(nodes.get(subtask.id) as TaskNode);
    }

    if (task.parentTaskId && nodes.has(task.parentTaskId)) {
      const parent = nodes.get(task.parentTaskId) as TaskNode;
      if (!parent.subtasks.some((subtask) => subtask.id === task.id)) parent.subtasks.push(node);
    } else if (!tasks.some((candidate) => candidate.subtasks?.some((subtask) => subtask.id === task.id))) {
      roots.push(node);
    }
  }

  return roots.sort((first, second) => first.position - second.position);
}

function flattenTaskTree(tasks: TaskNode[], depth = 0): Array<{ id: string; title: string; depth: number }> {
  return tasks.flatMap((task) => [{ id: task.id, title: task.title, depth }, ...flattenTaskTree(task.subtasks, depth + 1)]);
}
