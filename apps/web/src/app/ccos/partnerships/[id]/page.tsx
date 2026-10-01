"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type TimelineItem = { id: string; type?: string; direction?: string; channel?: string; summary?: string; occurredAt?: string; createdAt?: string; sources?: Array<{ sourceType: string; sourceId: string }> };
type Partnership = { id: string; title?: string | null; status: string; priority: string; waitingReason?: string | null };
export default function PartnershipPage({ params }: { params: { id: string } }) {
  const [partnership, setPartnership] = useState<Partnership | null>(null); const [timeline, setTimeline] = useState<TimelineItem[]>([]); const [opportunity, setOpportunity] = useState<{ state: string; revision: number } | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => {
    const urls = [`/backend/ccos/partnerships/${params.id}`, `/backend/ccos/partnerships/${params.id}/timeline`, `/backend/ccos/partnerships/${params.id}/opportunity`];
    const responses = await Promise.all(urls.map((url) => fetch(url, { credentials: 'include', cache: 'no-store' })));
    if (responses.some((response) => response.status === 401)) { window.location.assign('/login'); return; }
    if (responses.some((response) => !response.ok)) throw new Error('Não foi possível carregar parceria, timeline ou oportunidade.');
    const [p, t, o] = await Promise.all(responses.map((response) => response.json()));
    setPartnership(p.partnership ?? p); setTimeline(t.timeline ?? []); setOpportunity(o.opportunity ?? o);
  }, [params.id]);
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, [load]);
  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const response = await fetch(`/backend/ccos/partnerships/${params.id}/opportunity/actions`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: form.get('kind'), title: form.get('title'), reason: form.get('reason'), evidence: { source: 'operator', note: form.get('evidence') } }) });
      if (!response.ok) throw new Error('Não foi possível criar a ação.'); formElement.reset(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha de conexão.'); }
  }
  if (error) return <State text={error} />; if (!partnership) return <State text="Carregando parceria…" />;
  return <div className="mx-auto max-w-5xl px-4 py-8"><a href="/ccos" className="text-sm font-semibold text-sky-700">← Voltar à operação</a><div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">{partnership.title || `Parceria ${partnership.id.slice(0, 8)}`}</h1><p className="mt-1 text-slate-600">Status {partnership.status} · prioridade {partnership.priority} · oportunidade {opportunity?.state ?? 'UNASSESSED'}</p><a href={`/ccos/operate?type=partnership&id=${params.id}`} className="text-sm text-sky-700">Avançar parceria / registrar trabalho →</a></div></div>
    <div className="mt-7 grid gap-6 lg:grid-cols-2"><section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Próxima ação humana</h2><form onSubmit={createAction} className="mt-4 space-y-3"><select name="kind" required className="w-full rounded-lg border px-3 py-2"><option value="follow_up">Follow-up</option><option value="replenishment">Reposição</option><option value="additional_sku">Novo SKU</option><option value="new_creative">Novo criativo</option><option value="expansion">Expansão</option></select><input name="title" required maxLength={255} placeholder="O que precisa acontecer?" className="w-full rounded-lg border px-3 py-2" /><input name="reason" required maxLength={2000} placeholder="Motivo" className="w-full rounded-lg border px-3 py-2" /><textarea name="evidence" required placeholder="Evidência revisada pelo operador" className="w-full rounded-lg border px-3 py-2" /><button className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white">Criar ação</button></form></section>
      <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Timeline canônica</h2>{timeline.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhum evento registrado.</p> : <ol className="mt-4 space-y-3">{timeline.map((item) => <li key={item.id} id={`event-${item.id}`} className="border-l-2 border-sky-200 pl-4"><p className="font-medium">{item.summary ?? item.type ?? 'Evento operacional'}</p><p className="text-xs text-slate-500">{item.channel ?? item.direction ?? 'sistema'} · {new Date(item.occurredAt ?? item.createdAt ?? Date.now()).toLocaleString('pt-BR')}</p>{item.sources?.map((source) => <a key={`${source.sourceType}-${source.sourceId}`} className="mr-3 text-xs text-sky-700" href={`/ccos/operate?type=${source.sourceType}&id=${source.sourceId}`}>{source.sourceType} {source.sourceId.slice(0, 8)} →</a>)}</li>)}</ol>}</section></div>
  </div>;
}
function State({ text }: { text: string }) { return <div className="mx-auto max-w-xl px-4 py-20 text-center text-slate-600">{text}</div>; }
