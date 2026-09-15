/**
 * Watchlists page — View and manage saved products, creators, shops, videos
 */

interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  items: Array<{
    id: string;
    entityType: string;
    entityId: string;
    notes: string | null;
    tags: string[];
  }>;
}

interface WatchlistsResponse {
  watchlists: Watchlist[];
}

async function getWatchlists(): Promise<WatchlistsResponse> {
  const res = await fetch('/api/watchlists', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    return { watchlists: [] };
  }
  return res.json();
}

function getEntityLabel(type: string): string {
  const labels: Record<string, string> = {
    product: 'Produto',
    creator: 'Criador',
    shop: 'Loja',
    video: 'Vídeo',
  };
  return labels[type] || type;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export default async function WatchlistsPage() {
  const { watchlists } = await getWatchlists();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Watchlists</h1>
          <p className="text-slate-600">
            Salve produtos, criadores, lojas e vídeos para acompanhar.
          </p>
        </div>
        <button
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          onClick={() => {
            const name = prompt('Nome da watchlist:');
            if (!name) return;
            fetch('/api/watchlists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ name }),
            }).then(() => window.location.reload());
          }}
        >
          Nova Watchlist
        </button>
      </div>

      {watchlists.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-slate-200">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Nenhuma watchlist ainda
          </h2>
          <p className="text-slate-500 mb-6">
            Crie uma watchlist para salvar produtos, criadores e vídeos que você quer acompanhar.
          </p>
          <button
            className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700"
            onClick={() => {
              const name = prompt('Nome da watchlist:');
              if (!name) return;
              fetch('/api/watchlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name }),
              }).then(() => window.location.reload());
            }}
          >
            Criar primeira watchlist
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {watchlists.map((wl) => (
            <div
              key={wl.id}
              className="rounded-xl bg-white p-6 shadow-sm border border-slate-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{wl.name}</h3>
                  {wl.description && (
                    <p className="text-sm text-slate-500 mt-1">{wl.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Criada em {formatDate(wl.createdAt)} · {wl.itemCount} itens
                  </p>
                </div>
                <button
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                  onClick={() => {
                    confirm('Deletar esta watchlist?') &&
                      fetch(`/api/watchlists/${wl.id}`, {
                        method: 'DELETE',
                        credentials: 'include',
                      }).then(() => window.location.reload());
                  }}
                >
                  Deletar
                </button>
              </div>

              {wl.items.length > 0 ? (
                <div className="grid gap-2">
                  {wl.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                          {getEntityLabel(item.entityType)}
                        </span>
                        <span className="text-sm text-slate-700 font-mono">
                          {item.entityId}
                        </span>
                        {item.notes && (
                          <span className="text-xs text-slate-500 truncate max-w-[200px]">
                            {item.notes}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                        <button
                          className="text-xs text-red-500 hover:text-red-700"
                          onClick={() => {
                            fetch(
                              `/api/watchlists/${wl.id}/items/${item.id}`,
                              { method: 'DELETE', credentials: 'include' }
                            ).then(() => window.location.reload());
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Nenhum item salvo. Use a página de produtos para adicionar itens.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}