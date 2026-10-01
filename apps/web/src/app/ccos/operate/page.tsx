"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { productTransitions, contentTransitions, partnershipTransitions } from '../../../lib/ccos-transitions';

type RecordItem = { id: string; name?: string; title?: string; status?: string; productId?: string; partnershipId?: string; platform?: string };
type Data = { stores: RecordItem[]; partnerships: RecordItem[]; products: RecordItem[]; contents: RecordItem[]; attention: RecordItem[] };
const operations = { store: 'Criar marca', partnership: 'Criar parceria', product: 'Criar produto / amostra', content: 'Criar conteúdo', partnershipStatus: 'Avançar parceria', productStatus: 'Avançar produto', contentStatus: 'Avançar conteúdo / Ads', performance: 'Registrar performance', action: 'Follow-up / reposição' };
type Operation = keyof typeof operations;
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';

export default function OperatorPage() {
  const [data, setData] = useState<Data | null>(null); const [operation, setOperation] = useState<Operation>('store');
  const [selected, setSelected] = useState(''); const [source, setSource] = useState<{ type: string; id: string } | null>(null);
  const [fetchedSource, setFetchedSource] = useState<RecordItem | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch('/backend/ccos/dashboard', { credentials: 'include', cache: 'no-store' });
    if (response.status === 401) { window.location.assign('/login'); return; }
    if (!response.ok) throw new Error('Falha ao carregar registros.');
    setData(await response.json());
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search); const type = query.get('type'); const id = query.get('id');
    if (type && id) { setSource({ type, id }); setSelected(id); if (type === 'product' || type === 'content' || type === 'partnership') setOperation(`${type}Status`); }
    load().catch((reason) => setError(reason.message));
  }, [load]);
  useEffect(() => {
    setFetchedSource(null);
    if (!source || !['action', 'template_version'].includes(source.type)) return;
    const path = source.type === 'action' ? `next-actions/${source.id}` : `templates/${source.id}`;
    fetch(`/backend/ccos/${path}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) { window.location.assign('/login'); return; }
        if (!response.ok) throw new Error('Origem não encontrada neste workspace.');
        const body = await response.json();
        setFetchedSource(body.nextAction ?? body.templateVersion ?? body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar origem.'));
  }, [source]);
  const options = !data ? [] : operation === 'partnership' ? data.stores : ['product', 'partnershipStatus', 'action'].includes(operation) ? data.partnerships
    : ['content', 'productStatus'].includes(operation) ? data.products : ['contentStatus', 'performance'].includes(operation) ? data.contents : [];
  const current = options.find((item) => item.id === selected);
  const transitionMap = operation === 'productStatus' ? productTransitions : operation === 'contentStatus' ? contentTransitions : partnershipTransitions;
  const transitions = operation.endsWith('Status') ? transitionMap[current?.status ?? ''] ?? [] : [];
  const sourceRecord = fetchedSource ?? (!data || !source ? null : (source.type === 'store' ? data.stores : source.type === 'partnership' ? data.partnerships : source.type === 'product' ? data.products : source.type === 'content' ? data.contents : data.attention).find((item) => item.id === source.id));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const optional = (name: string) => value(name) || undefined;
    const timestamp = (name: string) => value(name) ? new Date(value(name)).toISOString() : undefined;
    setBusy(true); setError(''); setMessage('');
    try {
      let url = ''; let method = 'POST'; let body: object = {};
      if (operation === 'store') { url = '/stores'; body = { name: value('name') }; }
      if (operation === 'partnership') { url = `/stores/${selected}/partnerships`; body = { title: value('name'), type: value('type') }; }
      if (operation === 'product') { url = `/partnerships/${selected}/products`; body = { name: value('name'), stockState: optional('stockState'), commissionRate: optional('commissionRate') }; }
      if (operation === 'content') { url = `/products/${selected}/contents`; body = { platform: value('platform'), concept: value('name') }; }
      if (operation === 'partnershipStatus') { method = 'PATCH'; url = `/partnerships/${selected}`; body = { status: value('status') }; }
      if (operation === 'productStatus') { method = 'PATCH'; url = `/products/${selected}`; body = { status: value('status'), ...(value('status') === 'received' ? { receivedAt: new Date().toISOString() } : {}) }; }
      if (operation === 'contentStatus') {
        method = 'PATCH'; url = `/contents/${selected}`;
        body = { status: optional('status'), scheduledAt: timestamp('scheduledAt'), publishedAt: timestamp('publishedAt'), publicationUrl: optional('publicationUrl'),
          adAuthorizationStatus: optional('adAuthorizationStatus'), adAuthorizationCode: optional('adAuthorizationCode'),
          adAuthorizationCreatedAt: timestamp('adAuthorizationCreatedAt'), adAuthorizationExpiresAt: timestamp('adAuthorizationExpiresAt') };
        if (Object.values(body).every((item) => item === undefined)) throw new Error('Selecione uma mudança de status ou preencha os detalhes.');
      }
      if (operation === 'performance') {
        url = `/contents/${selected}/performance`;
        const metrics: Record<string, object> = {};
        for (const metric of ['views', 'clicks', 'orders', 'gmv', 'commission', 'conversion']) if (value(metric)) metrics[metric] = {
          value: ['views', 'clicks', 'orders'].includes(metric) ? Number(value(metric)) : value(metric), classification: 'self-reported', provenance: { note: value('evidence') },
        };
        if (!Object.keys(metrics).length) throw new Error('Informe pelo menos uma métrica. Ausência não é zero.');
        body = { observedAt: timestamp('observedAt'), source: 'manual.operator', currency: optional('currency'), metrics };
      }
      if (operation === 'action') { url = `/partnerships/${selected}/opportunity/actions`; body = { kind: value('kind'), title: value('name'), reason: value('reason'), evidence: { source: 'operator', note: value('evidence') } }; }
      const response = await fetch(`/backend/ccos${url}`, { method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.status === 401) { window.location.assign('/login'); return; }
      const result = await response.json(); if (!response.ok) throw new Error(result.message ?? 'Operação recusada. Revise status e campos.');
      const record = result.store ?? result.partnership ?? result.product ?? result.content;
      if (record && ['store', 'partnership', 'product', 'content'].includes(operation)) setSource({ type: operation, id: record.id });
      formElement.reset(); setMessage('Salvo. A operação canônica foi atualizada.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-4xl px-4 py-8"><a href="/ccos" className="text-sky-700">← Operação</a><h1 className="mt-4 text-3xl font-bold">Mesa do operador</h1><p className="mt-2 text-slate-600">Registre a jornada sem planilha. Estados e validações são os mesmos do domínio canônico.</p>
    {source && <section className="mt-5 rounded-xl border bg-white p-4"><h2 className="font-semibold">Origem: {source.type} / {source.id}</h2>{sourceRecord ? <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(sourceRecord, null, 2)}</pre> : <p className="mt-2 text-sm">Origem não está na visão ativa. Volte à timeline para consultar seu histórico.</p>}</section>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}{message && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border bg-white p-6"><label className="block text-sm font-semibold">Operação<select value={operation} onChange={(event) => { setOperation(event.target.value as Operation); setSelected(''); }} className={inputClass}>{Object.entries(operations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {operation !== 'store' && <label className="block text-sm font-semibold">Registro relacionado<select required value={selected} onChange={(event) => setSelected(event.target.value)} className={inputClass}><option value="">Selecione…</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.title ?? item.platform ?? item.id.slice(0, 8)}{item.status ? ` (${item.status})` : ''}</option>)}</select></label>}
      {['store', 'partnership', 'product', 'content', 'action'].includes(operation) && <Input name="name" label={operation === 'content' ? 'Conceito do conteúdo' : 'Nome / título'} required />}
      {operation === 'partnership' && <Select name="type" label="Tipo de parceria" options={['inbound_invite', 'outbound_prospecting', 'affiliate', 'paid_campaign', 'gifting']} />}
      {operation === 'product' && <><Select name="stockState" label="Estoque (opcional)" options={['', 'in_stock', 'low_stock', 'out_of_stock']} required={false} /><Input name="commissionRate" label="Comissão percentual (opcional)" type="number" /></>}
      {operation === 'content' && <Input name="platform" label="Plataforma" required />}
      {operation.endsWith('Status') && <><p className="text-sm text-slate-500">Estado atual: {current?.status ?? 'selecione um registro'}</p><Select key={`${operation}-${selected}-${current?.status}`} name="status" label="Próximo estado permitido" options={operation === 'contentStatus' ? ['', ...transitions] : transitions} required={operation !== 'contentStatus'} /></>}
      {operation === 'contentStatus' && <><Input name="scheduledAt" label="Agendamento (obrigatório para scheduled)" type="datetime-local" /><Input name="publishedAt" label="Publicado em (obrigatório para published)" type="datetime-local" /><Input name="publicationUrl" label="URL publicada" type="url" /><Select name="adAuthorizationStatus" label="Autorização de Ads" options={['', 'pending', 'authorized', 'unavailable']} required={false} /><Input name="adAuthorizationCode" label="Código (obrigatório para authorized)" /><Input name="adAuthorizationCreatedAt" label="Código criado em" type="datetime-local" /><Input name="adAuthorizationExpiresAt" label="Código expira em (opcional)" type="datetime-local" /><p className="text-xs text-slate-500">Campos vazios preservam dados existentes. published exige data e URL; authorized exige código e data de criação.</p></>}
      {operation === 'performance' && <><Input name="observedAt" label="Data da observação" type="datetime-local" required /><div className="grid gap-3 sm:grid-cols-2">{['views', 'clicks', 'orders', 'gmv', 'commission', 'conversion'].map((metric) => <Input key={metric} name={metric} label={`${metric} (opcional${metric === 'conversion' ? ', razão 0–1' : ''})`} type="number" />)}</div><Input name="currency" label="Moeda ISO (BRL, USD; obrigatória para GMV/comissão)" /><Input name="evidence" label="Origem / evidência da leitura manual" required /><p className="text-sm text-slate-500">Leituras manuais são self-reported; campos vazios permanecem unavailable.</p></>}
      {operation === 'action' && <><Select name="kind" label="Ação humana" options={['follow_up', 'replenishment', 'additional_sku', 'new_creative', 'expansion']} /><Input name="reason" label="Motivo" required /><Input name="evidence" label="Evidência revisada" required /></>}
      <button disabled={busy || !data || (operation !== 'store' && !selected)} className="rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar no CCOS'}</button>
    </form>
  </div>;
}
function Input({ name, label, type = 'text', required = false }: { name: string; label: string; type?: string; required?: boolean }) { return <label className="block text-sm font-medium">{label}<input name={name} type={type} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} className={inputClass} /></label>; }
function Select({ name, label, options, required = true }: { name: string; label: string; options: readonly string[]; required?: boolean }) { return <label className="block text-sm font-medium">{label}<select name={name} required={required} className={inputClass}>{options.map((item) => <option key={item} value={item}>{item || 'Sem alteração / não informado'}</option>)}</select></label>; }
