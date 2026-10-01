"use client";

import { FormEvent, useState } from "react";
import { AuthShell, Field } from "../../components/auth-form";

export default function RegisterPage() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/backend/auth/register', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password'), displayName: data.get('displayName') }) });
      if (response.ok) window.location.assign('/ccos');
      else { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Não foi possível criar a conta.'); }
    } catch { setError('Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <AuthShell title="Criar workspace" subtitle="Comece a organizar parcerias, produtos e conteúdo agora."><form onSubmit={submit} className="space-y-4"><Field name="displayName" label="Nome do workspace" /><Field name="email" label="E-mail" type="email" /><Field name="password" label="Senha (mínimo 8 caracteres)" type="password" />{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Criando…' : 'Criar conta'}</button></form></AuthShell>;
}
