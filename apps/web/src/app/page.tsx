export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <section className="text-center mb-16">
        <h1 className="text-5xl font-bold text-slate-900 mb-6">
          Encontre o produto certo para promover
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
          TTSData analisa dados oficiais da TikTok Shop para mostrar quais produtos 
          estão em alta, por que estão movendo, e que conteúdo criar.
        </p>
        <div className="flex gap-4 justify-center">
          <a href="/register" className="rounded-lg bg-sky-600 px-6 py-3 text-lg font-medium text-white hover:bg-sky-700">
            Começar grátis
          </a>
          <a href="/products" className="rounded-lg border border-slate-300 px-6 py-3 text-lg font-medium text-slate-700 hover:bg-slate-50">
            Explorar produtos
          </a>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="text-3xl font-bold text-sky-600 mb-2">Oportunidade</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Score explicável</h3>
          <p className="text-slate-600">
            Cada produto recebe uma score de 0-100 com explicação clara dos fatores 
            que aumentaram ou reduziram a oportunidade.
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="text-3xl font-bold text-emerald-600 mb-2">Saturação</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Concorrência visível</h3>
          <p className="text-slate-600">
            Saiba quantos criadores já promovem o produto e se ainda há espaço 
            para se diferenciar.
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="text-3xl font-bold text-amber-600 mb-2">Tendência</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Ciclo de vida</h3>
          <p className="text-slate-600">
            Identifique se um produto está emergindo, crescendo, maduro ou em declínio 
            antes de entrar na trend.
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Como funciona</h2>
        <ol className="grid md:grid-cols-4 gap-6 text-slate-600">
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">1</div>
            <p>Conecte sua conta TikTok Shop</p>
          </li>
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">2</div>
            <p>Dados são ingeridos da API oficial</p>
          </li>
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">3</div>
            <p>Calculamos scores e tendências</p>
          </li>
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">4</div>
            <p>Você decide o que promover</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
