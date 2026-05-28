import type { ApiResponse, AuthPayload, PaginatedResult, User } from "@/lib/types";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
export const TOKEN_KEY = "taskflow.accessToken";

export function asArray<T>(payload: T[] | PaginatedResult<T>) {
  return Array.isArray(payload) ? payload : payload.data;
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function getStoredToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setStoredToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token = "") {
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

export function extractAuth(payload: AuthPayload) {
  if ("email" in payload) {
    return { user: payload, token: "" };
  }

  return {
    user: payload.user ?? null,
    token: payload.accessToken ?? payload.token ?? "",
  } satisfies { user: User | null; token: string };
}

export function getDisplayName(user: User | null) {
  if (!user) return "Teammate";
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
