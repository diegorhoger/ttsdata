"use client";

import { useEffect, useMemo, useState } from "react";

type Entity = { id: string; name?: string; title?: string; status?: string; partnershipId?: string; productId?: string; platform?: string; contentId?: string; actions?: Action[]; observedAt?: string; classifications?: Record<string, string>; provenance?: { source?: string }; views?: number | null; clicks?: number | null; orders?: number | null; gmv?: string | null; commission?: string | null; conversion?: string | null; currency?: string | null };
type Action = Entity & { dueAt: string | null; waitingReason?: string | null; overdue: boolean; partnershipIds: string[]; target: { type: string; id: string } };
type Dashboard = {
  asOf: string; counts: Record<string, number>; stores: Entity[]; partnerships: Entity[]; products: Entity[]; contents: Entity[];
  performance: Array<Entity & { observedAt?: string; views?: number | null; orders?: number | null }>;
  attention: Action[]; activePartnerships: Array<Entity & { waitingReason?: string | null; actions: Action[] }>;
  sections: { overdueReplies: Action[]; receivedProducts: Entity[]; awaitingPublication: Entity[]; awaitingAdAuthorization: Entity[]; followUp: Action[] };
  production: { items: Array<Entity & { score: number | null; coverage: number }> };
};
const tabs = ['inbox', 'partnerships', 'products', 'production', 'content', 'performance', 'brands'] as const;
const labels: Record<typeof tabs[number], string> = { inbox: 'Atenção', partnerships: 'Parcerias', products: 'Produtos', production: 'Produção', content: 'Conteúdo', performance: 'Performance', brands: 'Marcas' };

export default function CCOSPage() {
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState(''); const [tab, setTab] = useState<typeof tabs[number]>('inbox');
  useEffect(() => { fetch('/backend/ccos/dashboard', { credentials: 'include', cache: 'no-store' }).then(async (response) => {
    if (response.status === 401) { window.location.assign('/login'); return; }
    if (!response.ok) throw new Error('Não foi possível carregar a operação.'); setData(await response.json());
  }).catch((reason) => setError(reason.message)); }, []);
  const rows = useMemo(() => !data ? [] : tab === 'inbox' ? data.attention : tab === 'partnerships' ? data.activePartnerships : tab === 'products' ? data.products : tab === 'production' ? data.production.items : tab === 'content' ? data.contents : tab === 'performance' ? data.performance : data.stores, [data, tab]);
  if (error) return <State title="Falha ao carregar" detail={error} />;
  if (!data) return <State title="Carregando operação…" detail="Montando uma visão consistente do seu workspace." />;
  return <div className="mx-auto max-w-7xl px-4 py-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-sky-700">Creator Commerce OS</p><h1 className="text-3xl font-bold text-slate-950">Sua operação hoje</h1><p className="mt-1 text-sm text-slate-500">Atualizado em {new Date(data.asOf).toLocaleString('pt-BR')}</p></div><a href="/ccos/operate" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Registrar / avançar jornada</a></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Ações', data.counts.attention], ['Atrasadas', data.counts.overdueReplies], ['Recebidos', data.counts.receivedProducts], ['Publicar', data.counts.awaitingPublication], ['Follow-up', data.counts.followUp]].map(([label, value]) => <article key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold text-slate-950">{value}</p></article>)}</section>
    <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">Prioridades</h2><p className="mt-1 text-sm text-amber-900">{data.sections.overdueReplies.length} respostas atrasadas · {data.sections.awaitingAdAuthorization.length} conteúdos aguardando autorização · {data.production.items.length} itens na fila de produção.</p></section>
    <nav aria-label="Áreas do CCOS" className="mt-7 flex gap-2 overflow-x-auto border-b pb-3">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} aria-current={tab === item ? 'page' : undefined} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-sky-600 text-white' : 'bg-white text-slate-700'}`}>{labels[item]} <span className="opacity-70">{countFor(data, item)}</span></button>)}</nav>
    <section className="mt-5 rounded-xl border bg-white"><div className="border-b px-5 py-4"><h2 className="text-lg font-bold">{labels[tab]}</h2></div>{rows.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhum item nesta área. <a href="/ccos/operate" className="text-sky-700">Registrar trabalho</a></p> : <ul className="divide-y">{rows.map((item) => <Row key={item.id} item={item} tab={tab} data={data} />)}</ul>}</section>
    <section id="journey" className="mt-8 rounded-xl border bg-white p-5"><h2 className="font-bold">Jornada operacional V1</h2><ol className="mt-4 grid gap-2 md:grid-cols-5">{['Lead / convite', 'Parceria', 'Produto / amostra', 'Recebido', 'Produção', 'Publicado', 'Autorização de Ads', 'Revisão de performance', 'Follow-up / repetição'].map((step, index) => <li key={step} className="rounded-lg bg-slate-50 p-3 text-sm"><span className="mr-2 font-bold text-sky-700">{index + 1}</span>{step}</li>)}</ol></section>
  </div>;
}

function countFor(data: Dashboard, tab: typeof tabs[number]) { return tab === 'inbox' ? data.attention.length : tab === 'partnerships' ? data.activePartnerships.length : tab === 'products' ? data.products.length : tab === 'production' ? data.production.items.length : tab === 'content' ? data.contents.length : tab === 'performance' ? data.performance.length : data.stores.length; }
function Row({ item, tab, data }: { item: Entity & Partial<Action> & { score?: number | null; coverage?: number }; tab: typeof tabs[number]; data: Dashboard }) {
  const name = item.title ?? item.name ?? `${labels[tab]} ${item.id.slice(0, 8)}`;
  const type = item.target?.type ?? (tab === 'partnerships' ? 'partnership' : tab === 'brands' ? 'store' : tab === 'content' || tab === 'performance' ? 'content' : 'product');
  const sourceId = item.target?.id ?? (tab === 'performance' ? item.contentId : item.id);
  const productId = type === 'product' ? sourceId : data.contents.find((content) => content.id === sourceId)?.productId;
  const partnershipIds = item.partnershipIds?.length ? item.partnershipIds : type === 'store' ? data.partnerships.filter((partnership) => (partnership as Entity & { storeId?: string }).storeId === sourceId).map((partnership) => partnership.id)
    : [type === 'partnership' ? sourceId : item.partnershipId ?? data.products.find((product) => product.id === productId)?.partnershipId].filter((id): id is string => Boolean(id));
  return <li id={`${tab}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-semibold text-slate-900">{name}</p><p className="text-sm text-slate-500">{item.status ?? (item.overdue ? 'Atrasada' : 'Ativa')}{item.waitingReason ? ` · ${item.waitingReason}` : ''}{item.score !== undefined ? ` · score ${item.score ?? 'sem dados'} (${item.coverage ?? 0}% cobertura)` : ''}</p>
    {tab === 'partnerships' && item.actions?.map((action) => <p key={action.id} className="mt-1 text-sm text-slate-700">Próxima ação: {action.title}{action.waitingReason ? ` — ${action.waitingReason}` : ''}</p>)}
    {tab === 'performance' && <div className="mt-2 text-sm"><p>{item.observedAt ? new Date(item.observedAt).toLocaleString('pt-BR') : 'Data indisponível'} · fonte {item.provenance?.source ?? 'unavailable'}</p><dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">{(['views', 'clicks', 'orders', 'gmv', 'commission', 'conversion'] as const).map((metric) => <div key={metric}><dt className="inline font-medium">{metric}: </dt><dd className="inline">{item[metric] ?? 'unavailable'}{['gmv', 'commission'].includes(metric) && item[metric] !== null ? ` ${item.currency ?? ''}` : ''} <span className="text-slate-500">({item.classifications?.[metric] ?? 'unavailable'})</span></dd></div>)}</dl></div>}
    </div><div className="flex flex-wrap gap-3">{sourceId && type !== 'interaction' && <a className="text-sm font-semibold text-sky-700" href={`/ccos/operate?type=${type}&id=${sourceId}`}>Abrir origem →</a>}{partnershipIds.map((id) => <a key={id} className="text-sm font-semibold text-sky-700" href={`/ccos/partnerships/${id}${type === 'interaction' ? `#event-${sourceId}` : ''}`}>Timeline →</a>)}</div></li>;
}
function State({ title, detail }: { title: string; detail: string }) { return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-slate-600">{detail}</p></div>; }
