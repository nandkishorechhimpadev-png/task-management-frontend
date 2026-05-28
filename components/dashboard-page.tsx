"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, asArray, extractAuth, getDisplayName, getErrorMessage, getStoredToken, setStoredToken, slugify } from "@/lib/api";
import type { AuthPayload, PaginatedResult, Project, User, Workspace } from "@/lib/types";
import { EmptyState, Field, Metric, Panel, StatusMessage } from "@/components/ui";
import LoadingScreen from "./Loading-screen";

type AuthMode = "login" | "signup";

type AuthForm = {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
};

type WorkspaceForm = {
  name: string;
  description: string;
};

type ProjectForm = {
  name: string;
  description: string;
};

const emptyWorkspaceForm: WorkspaceForm = { name: "", description: "" };
const emptyProjectForm: ProjectForm = { name: "", description: "" };

export function DashboardPage() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState<AuthForm>({ email: "", password: "", confirmPassword: "", firstName: "", lastName: "" });
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceForm>(emptyWorkspaceForm);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState("");
  const [editingProjectId, setEditingProjectId] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isWorkspaceSubmitting, setIsWorkspaceSubmitting] = useState(false);
  const [isProjectSubmitting, setIsProjectSubmitting] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null, [selectedWorkspaceId, workspaces]);
  const activeProjects = useMemo(() => projects.filter((project) => project.status === "ACTIVE"), [projects]);
  const archivedProjects = useMemo(() => projects.filter((project) => project.status === "ARCHIVED"), [projects]);

  const showToast = useCallback((message: string, isError = false) => {
    setNotice(isError ? "" : message);
    setError(isError ? message : "");
  }, []);

  const loadWorkspaces = useCallback(
    async (authToken = token) => {
      const payload = await apiRequest<Workspace[] | PaginatedResult<Workspace>>("/api/v1/workspaces", { method: "GET" }, authToken);
      const nextWorkspaces = asArray(payload);
      setWorkspaces(nextWorkspaces);
      setSelectedWorkspaceId((currentId) => nextWorkspaces.some((workspace) => workspace.id === currentId) ? currentId : nextWorkspaces[0]?.id ?? "");
    },
    [token],
  );

  const loadProjects = useCallback(
    async (workspaceId: string, authToken = token) => {
      if (!workspaceId) {
        setProjects([]);
        return;
      }

      setLoadingProjects(true);
      try {
        const payload = await apiRequest<Project[] | PaginatedResult<Project>>(`/api/v1/workspaces/${workspaceId}/projects`, { method: "GET" }, authToken);
        setProjects(asArray(payload));
      } finally {
        setLoadingProjects(false);
      }
    },
    [token],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootSession() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        if (isMounted) setIsBooting(false);
        return;
      }

      try {
        const me = await apiRequest<User>("/api/v1/auth/me", { method: "GET" }, storedToken);
        const payload = await apiRequest<Workspace[] | PaginatedResult<Workspace>>("/api/v1/workspaces", { method: "GET" }, storedToken);
        if (!isMounted) return;

        const nextWorkspaces = asArray(payload);
        setToken(storedToken);
        setUser(me);
        setWorkspaces(nextWorkspaces);
        setSelectedWorkspaceId(nextWorkspaces[0]?.id ?? "");
      } catch (caughtError) {
        if (!isMounted) return;
        setStoredToken("");
        setToken("");
        showToast(getErrorMessage(caughtError), true);
      } finally {
        if (isMounted) setIsBooting(false);
      }
    }

    void bootSession();
    return () => {
      isMounted = false;
    };
  }, [showToast]);

  useEffect(() => {
    let isMounted = true;

    async function fetchWorkspaceProjects() {
      if (!user || !selectedWorkspaceId) {
        if (isMounted) setProjects([]);
        return;
      }

      setLoadingProjects(true);
      try {
        const payload = await apiRequest<Project[] | PaginatedResult<Project>>(`/api/v1/workspaces/${selectedWorkspaceId}/projects`, { method: "GET" }, token);
        if (isMounted) setProjects(asArray(payload));
      } catch (caughtError) {
        if (isMounted) showToast(getErrorMessage(caughtError), true);
      } finally {
        if (isMounted) setLoadingProjects(false);
      }
    }

    void fetchWorkspaceProjects();
    return () => {
      isMounted = false;
    };
  }, [selectedWorkspaceId, showToast, token, user]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (authMode === "signup" && authForm.password !== authForm.confirmPassword) throw new Error("Passwords do not match.");

      const payload = await apiRequest<AuthPayload>(`/api/v1/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(authMode === "login" ? { email: authForm.email, password: authForm.password } : { email: authForm.email, password: authForm.password, firstName: authForm.firstName, lastName: authForm.lastName }),
      });

      const auth = extractAuth(payload);
      const nextToken = auth.token || token;
      if (nextToken) {
        setStoredToken(nextToken);
        setToken(nextToken);
      }

      if (auth.user) setUser(auth.user);
      else setUser(await apiRequest<User>("/api/v1/auth/me", { method: "GET" }, nextToken));

      await loadWorkspaces(nextToken);
      showToast(authMode === "login" ? "Welcome back." : "Account created. Welcome aboard.");
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest<null>("/api/v1/auth/logout", { method: "POST" }, token);
    } catch {
    } finally {
      setStoredToken("");
      setToken("");
      setUser(null);
      setWorkspaces([]);
      setProjects([]);
      setSelectedWorkspaceId("");
      showToast("Signed out safely.");
    }
  };

  const handleWorkspaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsWorkspaceSubmitting(true);
    setError("");
    setNotice("");

    try {
      const workspace = await apiRequest<Workspace>(editingWorkspaceId ? `/api/v1/workspaces/${editingWorkspaceId}` : "/api/v1/workspaces", {
        method: editingWorkspaceId ? "PATCH" : "POST",
        body: JSON.stringify({ name: workspaceForm.name, description: workspaceForm.description || null }),
      }, token);

      setWorkspaceForm(emptyWorkspaceForm);
      setEditingWorkspaceId("");
      await loadWorkspaces(token);
      setSelectedWorkspaceId(workspace.id);
      showToast(editingWorkspaceId ? "Workspace updated." : "Workspace created.");
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    } finally {
      setIsWorkspaceSubmitting(false);
    }
  };

  const deleteWorkspace = async (workspace: Workspace) => {
    if (!window.confirm(`Delete workspace “${workspace.name}”?`)) return;
    try {
      await apiRequest<null>(`/api/v1/workspaces/${workspace.id}`, { method: "DELETE" }, token);
      setProjects([]);
      await loadWorkspaces(token);
      showToast("Workspace deleted.");
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    }
  };

  const handleProjectSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    setIsProjectSubmitting(true);
    setError("");
    setNotice("");

    try {
      await apiRequest<Project>(editingProjectId ? `/api/v1/workspaces/${selectedWorkspaceId}/projects/${editingProjectId}` : `/api/v1/workspaces/${selectedWorkspaceId}/projects`, {
        method: editingProjectId ? "PATCH" : "POST",
        body: JSON.stringify({ name: projectForm.name, description: projectForm.description || null }),
      }, token);
      setProjectForm(emptyProjectForm);
      setEditingProjectId("");
      await loadProjects(selectedWorkspaceId, token);
      showToast(editingProjectId ? "Project updated." : "Project created.");
    } catch (caughtError) {
      showToast(getErrorMessage(caughtError), true);
    } finally {
      setIsProjectSubmitting(false);
    }
  };

  if (isBooting) return <LoadingScreen />;
  if (!user) return <AuthScreen authMode={authMode} authForm={authForm} error={error} isSubmitting={isAuthSubmitting} notice={notice} setAuthForm={setAuthForm} setAuthMode={setAuthMode} onSubmit={handleAuthSubmit} />;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-600">TaskFlow</p>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Welcome, {getDisplayName(user)}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">{user.email}</span>
            <button type="button" onClick={handleLogout} className="btn-secondary">Logout</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <Panel eyebrow="Workspaces" title="Team hubs">
            <WorkspaceFormView form={workspaceForm} editingId={editingWorkspaceId} isSubmitting={isWorkspaceSubmitting} setForm={setWorkspaceForm} setEditingId={setEditingWorkspaceId} onSubmit={handleWorkspaceSubmit} />
          </Panel>
          <WorkspaceList workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} onSelect={setSelectedWorkspaceId} onEdit={(workspace) => { setEditingWorkspaceId(workspace.id); setWorkspaceForm({ name: workspace.name, description: workspace.description ?? "" }); }} onDelete={deleteWorkspace} />
        </aside>

        <section className="space-y-6">
          <StatusMessage notice={notice} error={error} />
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <div className="border-b border-slate-100 bg-slate-950 p-6 text-white md:p-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-300">Projects</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">{selectedWorkspace ? selectedWorkspace.name : "Select a workspace"}</h2>
                  <p className="mt-3 max-w-2xl text-slate-300">Open a project to view its paginated task table and recursive subtasks.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
                  <Metric label="Workspaces" value={workspaces.length} />
                  <Metric label="Active" value={activeProjects.length} />
                  <Metric label="Archived" value={archivedProjects.length} />
                </div>
              </div>
            </div>
            <div className="grid gap-8 p-6 md:p-8 xl:grid-cols-[360px_1fr]">
              <ProjectFormView form={projectForm} editingId={editingProjectId} isDisabled={!selectedWorkspaceId} isSubmitting={isProjectSubmitting} setForm={setProjectForm} setEditingId={setEditingProjectId} onSubmit={handleProjectSubmit} />
              <div className="space-y-6">
                {loadingProjects ? <EmptyState title="Loading projects" description="Fetching the latest project list from your API." /> : !selectedWorkspace ? <EmptyState title="Choose a workspace" description="Projects are scoped to a workspace." /> : projects.length === 0 ? <EmptyState title="No projects yet" description="Create a project to start coordinating work." /> : <><ProjectSection title="Active projects" projects={activeProjects} onEdit={(project) => { setEditingProjectId(project.id); setProjectForm({ name: project.name, description: project.description ?? "" }); }} onDelete={async (project) => { if (!window.confirm(`Delete project “${project.name}”?`)) return; await apiRequest<null>(`/api/v1/workspaces/${selectedWorkspaceId}/projects/${project.id}`, { method: "DELETE" }, token); await loadProjects(selectedWorkspaceId, token); showToast("Project deleted."); }} /><ProjectSection title="Archived projects" projects={archivedProjects} onEdit={(project) => { setEditingProjectId(project.id); setProjectForm({ name: project.name, description: project.description ?? "" }); }} onDelete={async (project) => { if (!window.confirm(`Delete project “${project.name}”?`)) return; await apiRequest<null>(`/api/v1/workspaces/${selectedWorkspaceId}/projects/${project.id}`, { method: "DELETE" }, token); await loadProjects(selectedWorkspaceId, token); showToast("Project deleted."); }} muted /></>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}


function AuthScreen({ authMode, authForm, error, isSubmitting, notice, setAuthForm, setAuthMode, onSubmit }: { authMode: AuthMode; authForm: AuthForm; error: string; isSubmitting: boolean; notice: string; setAuthForm: (form: AuthForm) => void; setAuthMode: (mode: AuthMode) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#1e3a8a,transparent_32%),linear-gradient(135deg,#020617,#0f172a_55%,#111827)] px-6 py-10 text-white">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-8 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
            TaskFlow Collaboration Suite
          </div>
          <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white md:text-7xl">Plan work, ship together, keep every workspace crisp.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">A production-ready frontend foundation for authenticated teams, workspace operations, project management, and now task execution.</p></div>
        <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 shadow-2xl shadow-blue-950/40 backdrop-blur-2xl">
          <div className="mb-6 flex rounded-2xl bg-slate-950/40 p-1">
            {(["login", "signup"] as const).map((mode) => <button key={mode} type="button" onClick={() => setAuthMode(mode)} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold capitalize transition ${authMode === mode ? "bg-white text-slate-950 shadow-lg" : "text-slate-300 hover:text-white"}`}>{mode}</button>)}</div>

          <form className="space-y-4" onSubmit={onSubmit}>{authMode === "signup" &&
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name"><input required value={authForm.firstName} onChange={(event) => setAuthForm({ ...authForm, firstName: event.target.value })} className="input-dark" placeholder="Ada" /></Field>
              <Field label="Last name"><input required value={authForm.lastName} onChange={(event) => setAuthForm({ ...authForm, lastName: event.target.value })} className="input-dark" placeholder="Lovelace" /></Field>
            </div>}
            <Field label="Email"><input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} className="input-dark" placeholder="you@company.com" /></Field>
            <Field label="Password"><input required type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} className="input-dark" placeholder="••••••••" /></Field>
            {authMode === "signup" && <Field label="Confirm password"><input required type="password" value={authForm.confirmPassword} onChange={(event) => setAuthForm({ ...authForm, confirmPassword: event.target.value })} className="input-dark" placeholder="••••••••" /></Field>}
            <StatusMessage notice={notice} error={error} /><button type="submit" disabled={isSubmitting} className="w-full rounded-2xl bg-cyan-300 px-5 py-4 font-black text-slate-950 shadow-xl shadow-cyan-950/40 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Connecting…" : authMode === "login" ? "Login" : "Create account"}</button>
          </form>
        </div>
      </section>
    </main>
  );
}

function WorkspaceFormView({ form, editingId, isSubmitting, setForm, setEditingId, onSubmit }: { form: WorkspaceForm; editingId: string; isSubmitting: boolean; setForm: (form: WorkspaceForm) => void; setEditingId: (id: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="space-y-4" onSubmit={onSubmit}><Field label="Workspace name" light>
    <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input-light" placeholder="Product Studio" /></Field>
    <Field label="Description" light>
      <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-light min-h-24 resize-none" placeholder="What does this workspace coordinate?" /></Field>
    <div className="grid grid-cols-2 gap-3"><button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? "Saving…" : editingId ? "Update" : "Create"}</button><button type="button" onClick={() => { setForm(emptyWorkspaceForm); setEditingId(""); }} className="btn-secondary">Clear</button></div></form>;
}

function WorkspaceList({ workspaces, selectedWorkspaceId, onSelect, onEdit, onDelete }: { workspaces: Workspace[]; selectedWorkspaceId: string; onSelect: (id: string) => void; onEdit: (workspace: Workspace) => void; onDelete: (workspace: Workspace) => Promise<void> }) {
  if (workspaces.length === 0) return <EmptyState title="No workspaces yet" description="Create your first workspace to unlock projects." />;
  return <div className="space-y-3">{workspaces.map((workspace) => <button key={workspace.id} type="button" onClick={() => onSelect(workspace.id)} className={`w-full rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${selectedWorkspaceId === workspace.id ? "border-blue-500 bg-blue-600 text-white shadow-blue-200" : "border-slate-200 bg-white text-slate-950"}`}><div className="flex items-start justify-between gap-4"><div><h3 className="font-black">{workspace.name}</h3><p className={selectedWorkspaceId === workspace.id ? "text-sm text-blue-100" : "text-sm text-slate-500"}>/{workspace.slug}</p></div><span className="rounded-full bg-black/10 px-3 py-1 text-xs font-bold">{workspace.members?.length ?? 1} member{(workspace.members?.length ?? 1) === 1 ? "" : "s"}</span></div>{workspace.description && <p className={selectedWorkspaceId === workspace.id ? "mt-3 text-sm text-blue-50" : "mt-3 text-sm text-slate-600"}>{workspace.description}</p>}<div className="mt-4 flex gap-2"><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onEdit(workspace); }} onKeyDown={(event) => { if (event.key === "Enter") onEdit(workspace); }} className="rounded-full bg-white/20 px-3 py-1 text-xs font-black">Edit</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void onDelete(workspace); }} onKeyDown={(event) => { if (event.key === "Enter") void onDelete(workspace); }} className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-black text-red-100">Delete</span></div></button>)}</div>;
}

function ProjectFormView({ form, editingId, isDisabled, isSubmitting, setForm, setEditingId, onSubmit }: { form: ProjectForm; editingId: string; isDisabled: boolean; isSubmitting: boolean; setForm: (form: ProjectForm) => void; setEditingId: (id: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5" onSubmit={onSubmit}>
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Project form</p><h3 className="mt-1 text-2xl font-black">{editingId ? "Update project" : "Create project"}</h3>
    </div>
    <Field label="Project name" light>
      <input required disabled={isDisabled} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input-light disabled:cursor-not-allowed disabled:bg-slate-100" placeholder="Mobile launch" />
    </Field>
    <Field label="Description" light><textarea disabled={isDisabled} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-light min-h-28 resize-none disabled:cursor-not-allowed disabled:bg-slate-100" placeholder="Project goals, stakeholders, milestones…" />
    </Field>
    <button type="submit" disabled={isDisabled || isSubmitting} className="btn-primary">{isSubmitting ? "Saving…" : editingId ? "Update" : "Create"}</button>
    <button type="button" onClick={() => { setForm(emptyProjectForm); setEditingId(""); }} className="btn-secondary">Clear</button>

  </form>
}

function ProjectSection({ title, projects, muted = false, onEdit, onDelete }: { title: string; projects: Project[]; muted?: boolean; onEdit: (project: Project) => void; onDelete: (project: Project) => Promise<void> }) {
  if (projects.length === 0) return null;
  return <div>
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-lg font-black">{title}</h3>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{projects.length}</span>

    </div>
    <div className="grid gap-4 md:grid-cols-2">{
      projects.map((project) => <article key={project.id} className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl 
      ${muted ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-xl font-black tracking-tight">{project.name}</h4>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Created {new Date(project.createdAt).toLocaleDateString()}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${project.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{project.status}</span></div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">{project.description || "No description yet. Add context so teammates know what this project owns."}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/projects/${project.workspaceId}/${project.id}`} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-700">
            Open tasks</Link><button type="button" onClick={() => onEdit(project)} className="btn-secondary !px-4 !py-2 text-sm">Edit</button>
          <button
            type="button"
            onClick={() => void
              onDelete(project)}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100">
            Delete</button>
        </div>
      </article>)}
    </div>
  </div>;

}

