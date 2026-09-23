import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TTSData - TikTok Shop Market Intelligence',
  description: 'Find the right TikTok Shop product, understand why it is moving, and know what content to create.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-sky-600">
              TTSData
            </a>
            <nav className="flex gap-6 text-sm font-medium text-slate-600">
              <a href="/products" className="hover:text-sky-600">Produtos</a>
              <a href="/today" className="hover:text-sky-600">Hoje</a>
              <a href="/watchlists" className="hover:text-sky-600">Watchlists</a>
              <a href="/alerts" className="hover:text-sky-600">Alertas</a>
              <a href="/onboarding" className="hover:text-sky-600">Onboarding</a>
              <a href="/connect" className="hover:text-sky-600">Conectar TikTok</a>
              <a href="/settings" className="hover:text-sky-600">Configurações</a>
            </nav>
            <div className="flex gap-3">
              <a href="/login" className="text-sm font-medium text-slate-600 hover:text-sky-600">
                Entrar
              </a>
              <a href="/register" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
                Criar conta
              </a>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="mx-auto max-w-7xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>TTSData &copy; 2024. Dados oficiais da TikTok Display API.</p>
            <div className="flex gap-4">
              <a href="/terms" className="hover:text-sky-600">Termos de Serviço</a>
              <a href="/privacy" className="hover:text-sky-600">Política de Privacidade</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
