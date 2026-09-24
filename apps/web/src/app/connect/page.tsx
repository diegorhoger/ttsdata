"use client";

import { useState, useEffect } from "react";


/**
 * TikTok Connect Page - Verification Only
 * 
 * This page initiates the TikTok Display API OAuth flow.
 * No data is collected until the user explicitly authorizes.
 */
export default function TikTokConnectPage() {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || "http://localhost:3000/api/auth/tiktok/callback";
  
  // Generate a random state parameter for CSRF protection
  const state = Math.random().toString(36).substring(7);
  
  // Display API scopes - minimal required
  const scopes = ["user.info.basic", "video.list"];

  const handleConnect = () => {
    if (!clientId) {
      alert("TikTok Client Key não configurada. Verifique as variáveis de ambiente.");
      return;
    }

    // Store state in sessionStorage for verification on callback
    sessionStorage.setItem("tiktok_oauth_state", state);

    // Build TikTok authorization URL
    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.set("client_key", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(","));
    authUrl.searchParams.set("state", state);

    window.location.href = authUrl.toString();
  };

  // Check for success/error from OAuth callback
  const [oauthResult, setOauthResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check if already connected
    const connected = localStorage.getItem('tiktok_connected') === 'true';
    setIsConnected(connected);

    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    const scope = params.get('scope');
    const description = params.get('description');

    if (success) {
      setOauthResult({ type: 'success', message: `Autorização concluída! Escopos: ${scope || 'N/A'}` });
      localStorage.setItem('tiktok_connected', 'true');
      setIsConnected(true);
    } else if (error) {
      setOauthResult({ type: 'error', message: `Erro: ${error}${description ? ' - ' + description : ''}` });
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <section className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-6">
          Conecte sua conta TikTok
        </h1>

        {oauthResult && (
          <div className={`mb-8 rounded-xl p-6 ${oauthResult.type === 'success' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`font-medium ${oauthResult.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
              {oauthResult.type === 'success' ? '✅' : '❌'} {oauthResult.message}
            </p>
          </div>
        )}
        <p className="text-lg text-slate-600 mb-8">
          Para acessar suas análises de performance, precisamos da sua autorização
          para ler seu perfil público e lista de vídeos através da TikTok Display API.
        </p>

        <div className="bg-white rounded-xl border border-slate-200 p-8 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            O que vamos acessar:
          </h2>
          <ul className="text-left space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <span><strong>Perfil público:</strong> Nome, avatar, contagem de seguidores</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <span><strong>Vídeos públicos:</strong> Títulos, visualizações, curtidas, comentários</span>
            </li>
          </ul>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-900 mb-2">
              O que NÃO fazemos:
            </h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>✗ Não acessamos dados de outros usuários</li>
              <li>✗ Não coletamos dados do TikTok Shop</li>
              <li>✗ Não armazenamos informações privadas</li>
              <li>✗ Não postamos conteúdo em seu nome</li>
            </ul>
          </div>
        </div>

        {isConnected ? (
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-6 py-4">
              <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              <span className="text-emerald-800 font-medium">Conta TikTok conectada</span>
            </div>
            <p className="text-sm text-slate-500">
              Sua conta está conectada e pronta para uso.
            </p>
            <div className="flex gap-3">
              <a
                href="/products"
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 transition-colors"
              >
                Ver Produtos
              </a>
              <a
                href="/settings"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-6 py-3 font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Configurações
              </a>
            </div>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-3 rounded-lg bg-slate-900 px-8 py-4 text-lg font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
            Conectar com TikTok
          </button>
        )}

        <p className="mt-6 text-sm text-slate-500">
          Ao conectar, você concorda com nossos{" "}
          <a href="/terms" className="text-sky-600 hover:underline">
            Termos de Serviço
          </a>{" "}
          e{" "}
          <a href="/privacy" className="text-sky-600 hover:underline">
            Política de Privacidade
          </a>
          .
        </p>
      </section>
    </div>
  );
}
