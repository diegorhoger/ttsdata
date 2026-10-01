"use client";

import { FormEvent, useState } from "react";
import { AuthShell, Field } from "../../components/auth-form";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/backend/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      if (response.ok) window.location.assign('/ccos');
      else { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Não foi possível entrar.'); }
    } catch { setError('Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <AuthShell title="Entrar no CCOS" subtitle="Gerencie sua operação sem depender de uma integração externa.">
    <form onSubmit={submit} className="space-y-4"><Field name="email" label="E-mail" type="email" /><Field name="password" label="Senha" type="password" />{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Entrando…' : 'Entrar'}</button></form>
    <p className="mt-5 text-sm text-slate-600">Ainda não tem conta? <a className="text-sky-700" href="/register">Criar workspace</a></p>
  </AuthShell>;
}
