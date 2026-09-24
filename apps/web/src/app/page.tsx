export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <section className="text-center mb-16">
        <h1 className="text-5xl font-bold text-slate-900 mb-6">
          Suas métricas do TikTok em um só lugar
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
          TTSData mostra a performance do seu perfil e dos seus vídeos públicos 
          usando dados autorizados pela TikTok Display API.
        </p>
        <div className="flex gap-4 justify-center">
          <a href="/connect" className="rounded-lg bg-sky-600 px-6 py-3 text-lg font-medium text-white hover:bg-sky-700">
            Conectar com TikTok
          </a>
          <a href="/privacy" className="rounded-lg border border-slate-300 px-6 py-3 text-lg font-medium text-slate-700 hover:bg-slate-50">
            Política de Privacidade
          </a>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="text-3xl font-bold text-sky-600 mb-2">Perfil</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Seu perfil</h3>
          <p className="text-slate-600">
            Visualize seu nome, avatar, contagem de seguidores e vídeos públicos 
            diretamente do TikTok.
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="text-3xl font-bold text-emerald-600 mb-2">Vídeos</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Seus vídeos</h3>
          <p className="text-slate-600">
            Acompanhe visualizações, curtidas, comentários e compartilhamentos 
            dos seus vídeos públicos.
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="text-3xl font-bold text-amber-600 mb-2">Histórico</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Seu histórico</h3>
          <p className="text-slate-600">
            Compare a performance dos seus vídeos ao longo do tempo com 
            sincronizações determinísticas.
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Como funciona</h2>
        <ol className="grid md:grid-cols-4 gap-6 text-slate-600">
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">1</div>
            <p>Conecte sua conta TikTok</p>
          </li>
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">2</div>
            <p>Autorize acesso ao perfil e vídeos</p>
          </li>
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">3</div>
            <p>Veja sua performance pessoal</p>
          </li>
          <li>
            <div className="text-2xl font-bold text-sky-600 mb-1">4</div>
            <p>Desconecte ou exclua dados</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
