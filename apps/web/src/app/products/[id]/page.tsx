/**
 * Product detail page with trend charts, scores, creators, videos
 */

interface ProductDetail {
  product: {
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    categoryPath: string[] | null;
    shop: { id: string; name: string; logoUrl: string | null };
    status: string;
    lastObservedAt: string | null;
  };
  currentMetrics: {
    price: { value: number; currency: string; classification: string };
    commissionRate: { value: number; classification: string };
    stockSignal: string | null;
    rating: number | null;
    reviewCount: number | null;
    salesVolume: number | null;
  } | null;
  history: Array<{
    observedAt: string;
    price: number;
    commissionRate: number;
    rating: number | null;
    salesVolume: number | null;
  }>;
  linkedCreators: Array<{
    id: string;
    displayName: string;
    avatarUrl: string | null;
    followerCount: number | null;
  }>;
  linkedVideos: Array<{
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    viewCount: number | null;
    likeCount: number | null;
    publishedAt: string | null;
  }>;
  opportunityScore: {
    score: number;
    confidence: string;
    components: Array<{
      name: string;
      weight: number;
      normalizedValue: number;
      contribution: number;
      explanation: string;
    }>;
    calculatedAt: string;
  } | null;
  saturationScore: {
    level: string;
    score: number;
    explanation: string;
    calculatedAt: string;
  } | null;
  trend: {
    window: string;
    growthRate: number;
    lifecycle: string;
    confidence: string;
    calculatedAt: string;
  } | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getProduct(id: string): Promise<ProductDetail | null> {
  const res = await fetch(`${API_URL}/api/products/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const data = await getProduct(params.id);

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Produto não encontrado</h1>
        <a href="/products" className="mt-4 inline-block text-sky-600 hover:underline">
          Voltar para produtos
        </a>
      </div>
    );
  }

  const { product, currentMetrics, history, linkedCreators, linkedVideos, opportunityScore, saturationScore, trend } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate-500">
        <a href="/products" className="hover:text-sky-600">Produtos</a>
        <span className="mx-2">/</span>
        <span className="text-slate-900 truncate">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Product header */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="flex gap-6">
              <div className="h-40 w-40 flex-shrink-0 rounded-lg bg-slate-100 overflow-hidden">
                {product.imageUrl && (
                  <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">{product.title}</h1>
                <p className="text-sm text-slate-500 mb-3">
                  Loja: <span className="font-medium text-slate-700">{product.shop.name}</span>
                </p>
                {currentMetrics && (
                  <div className="flex flex-wrap gap-3">
                    <div>
                      <div className="text-2xl font-bold text-slate-900">
                        {formatCurrency(currentMetrics.price.value, currentMetrics.price.currency)}
                      </div>
                      <div className="text-xs text-slate-500">Preço</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-600">
                        {formatPercent(currentMetrics.commissionRate.value)}
                      </div>
                      <div className="text-xs text-slate-500">Comissão</div>
                    </div>
                    {currentMetrics.rating && (
                      <div>
                        <div className="text-2xl font-bold text-amber-500">
                          ★ {currentMetrics.rating.toFixed(1)}
                        </div>
                        <div className="text-xs text-slate-500">{currentMetrics.reviewCount} avaliações</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Score explanation */}
          {opportunityScore && (
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Score de Oportunidade</h2>
              <div className="flex items-center gap-6 mb-6">
                <div className="text-center">
                  <div className="text-5xl font-bold text-sky-600">{opportunityScore.score}</div>
                  <div className="text-sm text-slate-500">de 100</div>
                </div>
                <div className="flex-1">
                  <div className="mb-2 text-sm font-medium text-slate-700">Fatores que compõem o score:</div>
                  <div className="space-y-2">
                    {opportunityScore.components.map((comp) => (
                      <div key={comp.name} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-slate-500 capitalize">{comp.name.replace('_', ' ')}</div>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 rounded-full"
                            style={{ width: `${comp.normalizedValue}%` }}
                          />
                        </div>
                        <div className="w-16 text-xs text-slate-600 text-right">{comp.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Calculado em {new Date(opportunityScore.calculatedAt).toLocaleString('pt-BR')} | 
                Confiança: {opportunityScore.confidence}
              </p>
            </div>
          )}

          {/* Saturation */}
          {saturationScore && (
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-2">Saturação de Criadores</h2>
              <div className="flex items-center gap-4 mb-3">
                <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  saturationScore.level === 'low' ? 'bg-emerald-100 text-emerald-800' :
                  saturationScore.level === 'moderate' ? 'bg-amber-100 text-amber-800' :
                  saturationScore.level === 'high' ? 'bg-red-100 text-red-800' :
                  'bg-slate-100 text-slate-800'
                }`}>
                  {saturationScore.level === 'low' ? 'Baixa' :
                   saturationScore.level === 'moderate' ? 'Moderada' :
                   saturationScore.level === 'high' ? 'Alta' : 'Desconhecida'}
                </div>
                <span className="text-sm text-slate-600">{saturationScore.explanation}</span>
              </div>
            </div>
          )}

          {/* Linked creators */}
          {linkedCreators.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Criadores ({linkedCreators.length})</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {linkedCreators.slice(0, 8).map((creator) => (
                  <div key={creator.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                    <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden">
                      {creator.avatarUrl && (
                        <img src={creator.avatarUrl} alt={creator.displayName} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">{creator.displayName}</div>
                      {creator.followerCount && (
                        <div className="text-xs text-slate-500">{formatNumber(creator.followerCount)} seguidores</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked videos */}
          {linkedVideos.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Vídeos ({linkedVideos.length})</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {linkedVideos.slice(0, 6).map((video) => (
                  <div key={video.id} className="rounded-lg bg-slate-50 overflow-hidden">
                    <div className="h-32 bg-slate-200">
                      {video.thumbnailUrl && (
                        <img src={video.thumbnailUrl} alt={video.title || ''} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium text-slate-900 truncate">{video.title || 'Sem título'}</div>
                      <div className="mt-1 flex gap-3 text-xs text-slate-500">
                        {video.viewCount && <span>{formatNumber(video.viewCount)} views</span>}
                        {video.likeCount && <span>{formatNumber(video.likeCount)} likes</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <button className="w-full rounded-lg bg-sky-600 px-4 py-3 font-medium text-white hover:bg-sky-700 mb-3">
              Salvar na Watchlist
            </button>
            <button className="w-full rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50 mb-3">
              Criar Alerta
            </button>
            <button className="w-full rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
              Comparar
            </button>
          </div>

          {/* Trend info */}
          {trend && (
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-3">Tendência (7 dias)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Crescimento</span>
                  <span className="font-medium text-slate-900">
                    {trend.growthRate > 0 ? '+' : ''}{(trend.growthRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ciclo</span>
                  <span className="font-medium text-slate-900 capitalize">{trend.lifecycle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Confiança</span>
                  <span className="font-medium text-slate-900 capitalize">{trend.confidence}</span>
                </div>
              </div>
            </div>
          )}

          {/* Data freshness */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
            <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">Proveniência dos dados</h4>
            <p className="text-xs text-slate-600">
              Fonte: TikTok Shop API (oficial)
              {product.lastObservedAt && (
                <> · Atualizado em {new Date(product.lastObservedAt).toLocaleString('pt-BR')}</>
              )}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Classificação: Observado, Calculado, Inferido
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
