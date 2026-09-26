/**
 * Product discovery page with search, filters, and sorting
 */

export const dynamic = "force-dynamic";


interface Product {
  id: string;
  title: string;
  imageUrl: string;
  shopName: string;
  price: { value: number; currency: string; classification: string };
  commissionRate: { value: number; classification: string };
  rating: number | null;
  creatorCount: number;
  opportunityScore: number | null;
  opportunityConfidence: string | null;
  saturationLevel: string | null;
  trendLifecycle: string | null;
  lastObservedAt: string;
}

interface ProductsResponse {
  data: Product[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getProducts(searchParams: Record<string, string>): Promise<ProductsResponse> {
  try {
    const params = new URLSearchParams(searchParams);
    const res = await fetch(`${API_URL}/api/products?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    }
    return res.json();
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  }
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getLifecycleLabel(lifecycle: string | null): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    emerging: { label: 'Emergindo', color: 'bg-emerald-100 text-emerald-800' },
    growing: { label: 'Crescendo', color: 'bg-sky-100 text-sky-800' },
    mature: { label: 'Maduro', color: 'bg-amber-100 text-amber-800' },
    declining: { label: 'Declinio', color: 'bg-red-100 text-red-800' },
    'insufficient-data': { label: 'Dados insuficientes', color: 'bg-slate-100 text-slate-800' },
  };
  return lifecycle ? map[lifecycle] || { label: lifecycle, color: 'bg-slate-100 text-slate-800' } : { label: '-', color: 'bg-slate-100 text-slate-800' };
}

function getSaturationLabel(level: string | null): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    low: { label: 'Baixa', color: 'bg-emerald-100 text-emerald-800' },
    moderate: { label: 'Moderada', color: 'bg-amber-100 text-amber-800' },
    high: { label: 'Alta', color: 'bg-red-100 text-red-800' },
    unknown: { label: 'Desconhecida', color: 'bg-slate-100 text-slate-800' },
  };
  return level ? map[level] || { label: level, color: 'bg-slate-100 text-slate-800' } : { label: '-', color: 'bg-slate-100 text-slate-800' };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { data: products, pagination } = await getProducts(searchParams);
  const sort = searchParams.sort || 'opportunity';
  const q = searchParams.q || '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Descobrir Produtos</h1>
        <p className="text-slate-600">
          Explore produtos TikTok Shop com dados de oportunidade, saturacao e tendencia.
        </p>
      </div>

      {/* Search and filters */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200 mb-6">
        <form method="GET" className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="q" className="block text-sm font-medium text-slate-700 mb-1">
              Buscar
            </label>
            <input
              type="text"
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Nome do produto ou loja..."
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="w-48">
            <label htmlFor="sort" className="block text-sm font-medium text-slate-700 mb-1">
              Ordenar por
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="opportunity">Oportunidade</option>
              <option value="momentum">Momentum</option>
              <option value="commission">Comissao</option>
              <option value="freshness">Mais recente</option>
              <option value="price_asc">Menor preco</option>
              <option value="price_desc">Maior preco</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-6 py-2 font-medium text-white hover:bg-sky-700"
            >
              Buscar
            </button>
          </div>
        </form>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-slate-600">
        {pagination.total} produtos encontrados
      </div>

      {/* Product grid */}
      <div className="grid gap-4">
        {products.map((product) => (
          <a
            key={product.id}
            href={`/products/${product.id}`}
            className="block rounded-xl bg-white p-4 shadow-sm border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all"
          >
            <div className="flex gap-4">
              {/* Thumbnail */}
              <div className="h-24 w-24 flex-shrink-0 rounded-lg bg-slate-100 overflow-hidden">
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{product.title}</h3>
                <p className="text-sm text-slate-500">{product.shopName}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                    {formatCurrency(product.price.value, product.price.currency)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                    {formatPercent(product.commissionRate.value)} comissao
                  </span>
                  {product.rating && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      ★ {product.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Scores */}
              <div className="flex flex-col items-end gap-2">
                {product.opportunityScore !== null && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-sky-600">{product.opportunityScore}</div>
                    <div className="text-xs text-slate-500">Oportunidade</div>
                  </div>
                )}
                <div className="flex gap-1">
                  {product.trendLifecycle && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getLifecycleLabel(product.trendLifecycle).color}`}>
                      {getLifecycleLabel(product.trendLifecycle).label}
                    </span>
                  )}
                  {product.saturationLevel && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getSaturationLabel(product.saturationLevel).color}`}>
                      {getSaturationLabel(product.saturationLevel).label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {product.creatorCount} criadores
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: Math.min(pagination.totalPages, 10) }, (_, i) => i + 1).map((page) => (
            <a
              key={page}
              href={`?page=${page}&sort=${sort}&q=${q}`}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                page === pagination.page
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {page}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
