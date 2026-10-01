import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-16"><section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="mb-6 mt-2 text-sm text-slate-600">{subtitle}</p>{children}</section></div>;
}
export function Field({ name, label, type = 'text' }: { name: string; label: string; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input required name={name} type={type} minLength={type === 'password' ? 8 : undefined} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>;
}
