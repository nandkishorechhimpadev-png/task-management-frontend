"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

type WorkspaceMember = {
    id: string;
    workspaceId: string;
    userId: string;
    user?: User;
    role: "ADMIN" | "MEMBER";
    joinedAt: string;
};

type Workspace = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    ownerId: string;
    owner?: User;
    members?: WorkspaceMember[];
    createdAt: string;
    updatedAt: string;
};

type Project = {
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

type ApiResponse<T> = {
    success: true;
    data: T;
    timestamp: string;
};

type PaginatedResult<T> = {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
};

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
    status: Project["status"];
};

type AuthPayload =
    | User
    | {
        user?: User;
        accessToken?: string;
        token?: string;
        refreshToken?: string;
    };

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TOKEN_KEY = "taskflow.accessToken";

const emptyWorkspaceForm: WorkspaceForm = {
    name: "",
    description: "",
};

const emptyProjectForm: ProjectForm = {
    name: "",
    description: "",
    status: "ACTIVE",
};

function getDisplayName(user: User | null) {
    if (!user) return "Teammate";
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function asArray<T>(payload: T[] | PaginatedResult<T>) {
    return Array.isArray(payload) ? payload : payload.data;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function getStoredToken() {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

function setStoredToken(token: string) {
    if (typeof window === "undefined") return;
    if (token) {
        window.localStorage.setItem(TOKEN_KEY, token);
    } else {
        window.localStorage.removeItem(TOKEN_KEY);
    }
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token = "") {
    const headers = new Headers(options.headers);

    if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
        const message =
            typeof body?.message === "string"
                ? body.message
                : typeof body?.error === "string"
                    ? body.error
                    : `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    if (body && typeof body === "object" && "success" in body && "data" in body) {
        return (body as ApiResponse<T>).data;
    }

    return body as T;
}

function extractAuth(payload: AuthPayload) {
    if ("email" in payload) {
        return { user: payload, token: "" };
    }

    return {
        user: payload.user ?? null,
        token: payload.accessToken ?? payload.token ?? "",
    };
}

export default function TaskManagementFrontend() {
    const [authMode, setAuthMode] = useState<AuthMode>("login");
    const [authForm, setAuthForm] = useState<AuthForm>({
        email: "",
        password: "",
        confirmPassword: "",
        firstName: "",
        lastName: "",
    });
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

    const selectedWorkspace = useMemo(
        () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
        [selectedWorkspaceId, workspaces],
    );

    const activeProjects = useMemo(
        () => projects.filter((project) => project.status === "ACTIVE"),
        [projects],
    );

    const archivedProjects = useMemo(
        () => projects.filter((project) => project.status === "ARCHIVED"),
        [projects],
    );

    const showToast = useCallback((message: string, isError = false) => {
        setNotice(isError ? "" : message);
        setError(isError ? message : "");
    }, []);

    const loadWorkspaces = useCallback(
        async (authToken = token) => {
            const payload = await apiRequest<Workspace[] | PaginatedResult<Workspace>>(
                "/api/v1/workspaces",
                { method: "GET" },
                authToken,
            );
            const nextWorkspaces = asArray(payload);

            setWorkspaces(nextWorkspaces);
            setSelectedWorkspaceId((currentId) => {
                if (nextWorkspaces.some((workspace) => workspace.id === currentId)) return currentId;
                return nextWorkspaces[0]?.id ?? "";
            });
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
                const payload = await apiRequest<Project[] | PaginatedResult<Project>>(
                    `/api/v1/workspaces/${workspaceId}/projects`,
                    { method: "GET" },
                    authToken,
                );
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
                const payload = await apiRequest<Workspace[] | PaginatedResult<Workspace>>(
                    "/api/v1/workspaces",
                    { method: "GET" },
                    storedToken,
                );

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
                const payload = await apiRequest<Project[] | PaginatedResult<Project>>(
                    `/api/v1/workspaces/${selectedWorkspaceId}/projects`,
                    { method: "GET" },
                    token,
                );

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
            if (authMode === "signup" && authForm.password !== authForm.confirmPassword) {
                throw new Error("Passwords do not match.");
            }

            const payload = await apiRequest<AuthPayload>(`/api/v1/auth/${authMode}`, {
                method: "POST",
                body: JSON.stringify(
                    authMode === "login"
                        ? { email: authForm.email, password: authForm.password }
                        : {
                            email: authForm.email,
                            password: authForm.password,
                            firstName: authForm.firstName,
                            lastName: authForm.lastName,
                        },
                ),
            });

            const auth = extractAuth(payload);
            const nextToken = auth.token || token;

            if (nextToken) {
                setStoredToken(nextToken);
                setToken(nextToken);
            }

            if (auth.user) {
                setUser(auth.user);
            } else {
                const me = await apiRequest<User>("/api/v1/auth/me", { method: "GET" }, nextToken);
                setUser(me);
            }

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
            // Logout should still clear the local session if the server cookie/token is already invalid.
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
            const body = {
                name: workspaceForm.name,
                description: workspaceForm.description || null,
            };

            const workspace = await apiRequest<Workspace>(
                editingWorkspaceId ? `/api/v1/workspaces/${editingWorkspaceId}` : "/api/v1/workspaces",
                {
                    method: editingWorkspaceId ? "PATCH" : "POST",
                    body: JSON.stringify(body),
                },
                token,
            );

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

    const startWorkspaceEdit = (workspace: Workspace) => {
        setEditingWorkspaceId(workspace.id);
        setWorkspaceForm({
            name: workspace.name,
            description: workspace.description ?? "",
        });
    };

    const deleteWorkspace = async (workspace: Workspace) => {
        if (!window.confirm(`Delete workspace “${workspace.name}” and its project list from this view?`)) return;

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
            const body = {
                name: projectForm.name,
                description: projectForm.description || null,

            };

            await apiRequest<Project>(
                editingProjectId
                    ? `/api/v1/workspaces/${selectedWorkspaceId}/projects/${editingProjectId}`
                    : `/api/v1/workspaces/${selectedWorkspaceId}/projects`,
                {
                    method: editingProjectId ? "PATCH" : "POST",
                    body: JSON.stringify(body),
                },
                token,
            );

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

    const startProjectEdit = (project: Project) => {
        setEditingProjectId(project.id);
        setProjectForm({
            name: project.name,
            description: project.description ?? "",
            status: project.status,
        });
    };

    const deleteProject = async (project: Project) => {
        if (!selectedWorkspaceId) return;
        if (!window.confirm(`Delete project “${project.name}”?`)) return;

        try {
            await apiRequest<null>(
                `/api/v1/workspaces/${selectedWorkspaceId}/projects/${project.id}`,
                { method: "DELETE" },
                token,
            );
            await loadProjects(selectedWorkspaceId, token);
            showToast("Project deleted.");
        } catch (caughtError) {
            showToast(getErrorMessage(caughtError), true);
        }
    };

    if (isBooting) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
                <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6 shadow-2xl shadow-blue-950/40">
                    <div className="mb-4 h-2 w-48 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300" />
                    </div>
                    <p className="text-sm text-slate-300">Loading your workspace cockpit…</p>
                </div>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#1e3a8a,transparent_32%),linear-gradient(135deg,#020617,#0f172a_55%,#111827)] px-6 py-10 text-white">
                <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                        <div className="mb-8 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
                            TaskFlow Collaboration Suite
                        </div>
                        <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white md:text-7xl">
                            Plan work, ship together, keep every workspace crisp.
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                            A production-ready frontend foundation for authenticated teams, workspace operations,
                            and project management — ready to plug into your existing API.
                        </p>
                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                            {["Secure auth", "Workspace CRUD", "Project boards"].map((item) => (
                                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-slate-950/30">
                                    <div className="mb-3 h-2 w-10 rounded-full bg-cyan-300" />
                                    <p className="font-semibold text-slate-100">{item}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 shadow-2xl shadow-blue-950/40 backdrop-blur-2xl">
                        <div className="mb-6 flex rounded-2xl bg-slate-950/40 p-1">
                            {(["login", "signup"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setAuthMode(mode)}
                                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold capitalize transition ${authMode === mode ? "bg-white text-slate-950 shadow-lg" : "text-slate-300 hover:text-white"
                                        }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>

                        <form className="space-y-4" onSubmit={handleAuthSubmit}>
                            {authMode === "signup" && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="First name">
                                        <input
                                            required
                                            value={authForm.firstName}
                                            onChange={(event) => setAuthForm({ ...authForm, firstName: event.target.value })}
                                            className="input-dark"
                                            placeholder="Ada"
                                        />
                                    </Field>
                                    <Field label="Last name">
                                        <input
                                            required
                                            value={authForm.lastName}
                                            onChange={(event) => setAuthForm({ ...authForm, lastName: event.target.value })}
                                            className="input-dark"
                                            placeholder="Lovelace"
                                        />
                                    </Field>
                                </div>
                            )}

                            <Field label="Email">
                                <input
                                    required
                                    type="email"
                                    value={authForm.email}
                                    onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                                    className="input-dark"
                                    placeholder="you@company.com"
                                />
                            </Field>

                            <Field label="Password">
                                <input
                                    required
                                    type="password"
                                    value={authForm.password}
                                    onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                                    className="input-dark"
                                    placeholder="••••••••"
                                />
                            </Field>

                            {authMode === "signup" && (
                                <Field label="Confirm password">
                                    <input
                                        required
                                        type="password"
                                        value={authForm.confirmPassword}
                                        onChange={(event) => setAuthForm({ ...authForm, confirmPassword: event.target.value })}
                                        className="input-dark"
                                        placeholder="••••••••"
                                    />
                                </Field>
                            )}

                            <StatusMessage notice={notice} error={error} />

                            <button
                                type="submit"
                                disabled={isAuthSubmitting}
                                className="w-full rounded-2xl bg-cyan-300 px-5 py-4 font-black text-slate-950 shadow-xl shadow-cyan-950/40 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isAuthSubmitting ? "Connecting…" : authMode === "login" ? "Login" : "Create account"}
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-100 text-slate-950">
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-600">TaskFlow</p>
                        <h1 className="text-2xl font-black tracking-tight md:text-3xl">Welcome, {getDisplayName(user)}</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
                            {user.email}
                        </span>
                        <button type="button" onClick={handleLogout} className="btn-secondary">
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[360px_1fr]">
                <aside className="space-y-6">
                    <Panel eyebrow="Workspaces" title="Team hubs">
                        <form className="space-y-4" onSubmit={handleWorkspaceSubmit}>
                            <Field label="Workspace name" light>
                                <input
                                    required
                                    value={workspaceForm.name}
                                    onChange={(event) =>
                                        setWorkspaceForm({
                                            ...workspaceForm,
                                            name: event.target.value
                                        })
                                    }
                                    className="input-light"
                                    placeholder="Product Studio"
                                />
                            </Field>

                            <Field label="Description" light>
                                <textarea
                                    value={workspaceForm.description}
                                    onChange={(event) => setWorkspaceForm({ ...workspaceForm, description: event.target.value })}
                                    className="input-light min-h-24 resize-none"
                                    placeholder="What does this workspace coordinate?"
                                />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <button type="submit" disabled={isWorkspaceSubmitting} className="btn-primary">
                                    {isWorkspaceSubmitting ? "Saving…" : editingWorkspaceId ? "Update" : "Create"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWorkspaceForm(emptyWorkspaceForm);
                                        setEditingWorkspaceId("");
                                    }}
                                    className="btn-secondary"
                                >
                                    Clear
                                </button>
                            </div>
                        </form>
                    </Panel>

                    <div className="space-y-3">
                        {workspaces.length === 0 ? (
                            <EmptyState title="No workspaces yet" description="Create your first workspace to unlock projects." />
                        ) : (
                            workspaces.map((workspace) => (
                                <button
                                    key={workspace.id}
                                    type="button"
                                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                                    className={`w-full rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${selectedWorkspaceId === workspace.id
                                        ? "border-blue-500 bg-blue-600 text-white shadow-blue-200"
                                        : "border-slate-200 bg-white text-slate-950"
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h3 className="font-black">{workspace.name}</h3>
                                            <p className={selectedWorkspaceId === workspace.id ? "text-sm text-blue-100" : "text-sm text-slate-500"}>
                                                /{workspace.slug}
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-black/10 px-3 py-1 text-xs font-bold">
                                            {workspace.members?.length ?? 1} member{(workspace.members?.length ?? 1) === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                    {workspace.description && (
                                        <p className={selectedWorkspaceId === workspace.id ? "mt-3 text-sm text-blue-50" : "mt-3 text-sm text-slate-600"}>
                                            {workspace.description}
                                        </p>
                                    )}
                                    <div className="mt-4 flex gap-2">
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                startWorkspaceEdit(workspace);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") startWorkspaceEdit(workspace);
                                            }}
                                            className="rounded-full bg-white/20 px-3 py-1 text-xs font-black"
                                        >
                                            Edit
                                        </span>
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void deleteWorkspace(workspace);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") void deleteWorkspace(workspace);
                                            }}
                                            className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-black text-red-100"
                                        >
                                            Delete
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                <section className="space-y-6">
                    <StatusMessage notice={notice} error={error} />

                    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                        <div className="border-b border-slate-100 bg-slate-950 p-6 text-white md:p-8">
                            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-300">Projects</p>
                                    <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
                                        {selectedWorkspace ? selectedWorkspace.name : "Select a workspace"}
                                    </h2>
                                    <p className="mt-3 max-w-2xl text-slate-300">
                                        Create, update, archive, and delete projects inside the selected workspace.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
                                    <Metric label="Workspaces" value={workspaces.length} />
                                    <Metric label="Active" value={activeProjects.length} />
                                    <Metric label="Archived" value={archivedProjects.length} />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-8 p-6 md:p-8 xl:grid-cols-[360px_1fr]">
                            <form className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5" onSubmit={handleProjectSubmit}>
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Project form</p>
                                    <h3 className="mt-1 text-2xl font-black">{editingProjectId ? "Update project" : "Create project"}</h3>
                                </div>
                                <Field label="Project name" light>
                                    <input
                                        required
                                        disabled={!selectedWorkspaceId}
                                        value={projectForm.name}
                                        onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
                                        className="input-light disabled:cursor-not-allowed disabled:bg-slate-100"
                                        placeholder="Mobile launch"
                                    />
                                </Field>
                                <Field label="Description" light>
                                    <textarea
                                        disabled={!selectedWorkspaceId}
                                        value={projectForm.description}
                                        onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                                        className="input-light min-h-28 resize-none disabled:cursor-not-allowed disabled:bg-slate-100"
                                        placeholder="Project goals, stakeholders, milestones…"
                                    />
                                </Field>
                                <Field label="Status" light>
                                    <select
                                        disabled={!selectedWorkspaceId}
                                        value={projectForm.status}
                                        onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as Project["status"] })}
                                        className="input-light disabled:cursor-not-allowed disabled:bg-slate-100"
                                    >
                                        <option value="ACTIVE">Active</option>
                                        <option value="ARCHIVED">Archived</option>
                                    </select>
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="submit" disabled={!selectedWorkspaceId || isProjectSubmitting} className="btn-primary">
                                        {isProjectSubmitting ? "Saving…" : editingProjectId ? "Update" : "Create"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setProjectForm(emptyProjectForm);
                                            setEditingProjectId("");
                                        }}
                                        className="btn-secondary"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </form>

                            <div className="space-y-6">
                                {loadingProjects ? (
                                    <EmptyState title="Loading projects" description="Fetching the latest project list from your API." />
                                ) : !selectedWorkspace ? (
                                    <EmptyState title="Choose a workspace" description="Projects are scoped to a workspace." />
                                ) : projects.length === 0 ? (
                                    <EmptyState title="No projects yet" description="Create a project to start coordinating work." />
                                ) : (
                                    <>
                                        <ProjectSection title="Active projects" projects={activeProjects} onEdit={startProjectEdit} onDelete={deleteProject} />
                                        <ProjectSection title="Archived projects" projects={archivedProjects} onEdit={startProjectEdit} onDelete={deleteProject} muted />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}

function Field({
    label,
    children,
    light = false,
}: {
    label: string;
    children: React.ReactNode;
    light?: boolean;
}) {
    return (
        <label className="block">
            <span className={`mb-2 block text-sm font-bold ${light ? "text-slate-700" : "text-slate-200"}`}>{label}</span>
            {children}
        </label>
    );
}

function StatusMessage({ notice, error }: { notice: string; error: string }) {
    if (!notice && !error) return null;

    return (
        <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
        >
            {error || notice}
        </div>
    );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
            <div className="mt-5">{children}</div>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
            <p className="text-2xl font-black">{value}</p>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">{label}</p>
        </div>
    );
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-xl">✦</div>
            <h3 className="font-black text-slate-950">{title}</h3>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
    );
}

function ProjectSection({
    title,
    projects,
    muted = false,
    onEdit,
    onDelete,
}: {
    title: string;
    projects: Project[];
    muted?: boolean;
    onEdit: (project: Project) => void;
    onDelete: (project: Project) => Promise<void>;
}) {
    if (projects.length === 0) return null;

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-black">{title}</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{projects.length}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {projects.map((project) => (
                    <article
                        key={project.id}
                        className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${muted ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200 bg-white"
                            }`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h4 className="text-xl font-black tracking-tight">{project.name}</h4>
                                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                                    Created {new Date(project.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <span
                                className={`rounded-full px-3 py-1 text-xs font-black ${project.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                                    }`}
                            >
                                {project.status}
                            </span>
                        </div>
                        <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">
                            {project.description || "No description yet. Add context so teammates know what this project owns."}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <button type="button" onClick={() => onEdit(project)} className="btn-secondary !px-4 !py-2 text-sm">
                                Edit
                            </button>
                            <button
                                type="button"
                                onClick={() => void onDelete(project)}
                                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100"
                            >
                                Delete
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
