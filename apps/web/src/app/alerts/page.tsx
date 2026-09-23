"use client";

/**
 * Alerts page — View alert rules and history
 */

interface AlertRule {
  id: string;
  name: string;
  triggerType: string;
  conditions: Record<string, any>;
  cooldownMinutes: number;
  deliveryChannels: string[];
  active: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface AlertHistoryItem {
  id: string;
  alertRuleId: string;
  alertRuleName: string;
  triggerData: Record<string, any>;
  delivered: boolean;
  createdAt: string;
}

interface AlertsResponse {
  rules: AlertRule[];
  history: AlertHistoryItem[];
}

async function getAlerts(): Promise<AlertsResponse> {
  const res = await fetch('/api/alerts/rules', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return { rules: [], history: [] };
  const rulesData = await res.json();

  const histRes = await fetch('/api/alerts/history', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!histRes.ok) return { rules: rulesData.rules, history: [] };
  const historyData = await histRes.json();

  return { rules: rulesData.rules, history: historyData.history };
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export default async function AlertsPage() {
  const { rules, history } = await getAlerts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Alertas</h1>
          <p className="text-slate-600">
            Configure regras de alerta e visualize histórico de notificações.
          </p>
        </div>
        <button
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          onClick={() => {
            const name = prompt('Nome do alerta:');
            if (!name) return;
            const triggerType = prompt(
              'Tipo: score_threshold | momentum | commission_change | price_change | saturation | new_content'
            );
            if (!triggerType) return;
            fetch('/api/alerts/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ name, triggerType, conditions: {}, cooldownMinutes: 60, deliveryChannels: ['in_app'] }),
            }).then(() => window.location.reload());
          }}
        >
          Novo Alerta
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Rules */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Regras de Alerta</h2>
          {rules.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center shadow-sm border border-slate-200">
              <div className="text-4xl mb-3">🔔</div>
              <p className="text-slate-500">Nenhuma regra de alerta configurada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{rule.name}</h3>
                      <p className="text-sm text-slate-500">{rule.triggerType}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      rule.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {rule.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-slate-500">
                    <span>Cooldown: {rule.cooldownMinutes}min</span>
                    <span>Canais: {rule.deliveryChannels.join(', ')}</span>
                  </div>
                  {rule.lastTriggeredAt && (
                    <p className="mt-1 text-xs text-slate-400">
                      Último disparo: {formatDate(rule.lastTriggeredAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Histórico</h2>
          {history.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center shadow-sm border border-slate-200">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-500">Nenhum alerta disparado ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="rounded-lg bg-white px-4 py-3 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 text-sm">{item.alertRuleName}</span>
                    <span className="text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                      item.delivered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {item.delivered ? 'Entregue' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
