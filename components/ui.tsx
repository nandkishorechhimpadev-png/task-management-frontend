import type { ReactNode } from "react";

export function Field({ label, children, light = false }: { label: string; children: ReactNode; light?: boolean }) {
  return (
    <label className="block">
      <span className={`mb-2 block text-sm font-bold ${light ? "text-slate-700" : "text-slate-200"}`}>{label}</span>
      {children}
    </label>
  );
}

export function StatusMessage({ notice, error }: { notice: string; error: string }) {
  if (!notice && !error) return null;

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {error || notice}
    </div>
  );
}

export function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-xl">✦</div>
      <h3 className="font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
