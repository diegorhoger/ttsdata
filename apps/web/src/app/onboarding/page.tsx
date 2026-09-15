/**
 * Onboarding page — guides user through TikTok Shop connection
 * 
 * Key principles:
 * - Show value before requiring connection
 * - Clear separation between personal analytics and aggregate data contribution
 * - No penalty for skipping
 * - Consent text and policy version tracked
 */

'use client';

import { useState } from 'react';

interface OnboardingState {
  step: 'welcome' | 'connect' | 'consent' | 'complete';
  connectionStatus: 'none' | 'connecting' | 'connected' | 'error';
  personalAnalytics: boolean;
  aggregateContribution: boolean;
  privacyPolicyAccepted: boolean;
  termsAccepted: boolean;
}

export default function OnboardingPage() {
  const [state, setState] = useState<OnboardingState>({
    step: 'welcome',
    connectionStatus: 'none',
    personalAnalytics: true,
    aggregateContribution: false,
    privacyPolicyAccepted: false,
    termsAccepted: false,
  });

  const handleConnect = async () => {
    setState({ ...state, connectionStatus: 'connecting' });
    try {
      const res = await fetch('/api/tiktok/auth-url', { credentials: 'include' });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setState({ ...state, connectionStatus: 'error' });
    }
  };

  const handleSkip = async () => {
    setState({ ...state, step: 'complete' });
    // No penalty — just record the skip consent
    await fetch('/api/onboarding/skip', {
      method: 'POST',
      credentials: 'include',
    });
  };

  const handleConsent = async () => {
    setState({ ...state, step: 'complete' });
    await fetch('/api/onboarding/consent', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalAnalytics: state.personalAnalytics,
        aggregateContribution: state.aggregateContribution,
        privacyPolicyAccepted: state.privacyPolicyAccepted,
        termsAccepted: state.termsAccepted,
      }),
    });
  };

  if (state.step === 'welcome') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-6">
          Bem-vindo ao TTSData
        </h1>
        <p className="text-xl text-slate-600 mb-8 max-w-lg mx-auto">
          Encontre os produtos certos para promover na TikTok Shop com dados
          inteligentes e scores explicáveis.
        </p>

        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Como funciona
          </h2>
          <ol className="text-left space-y-4 text-slate-600">
            <li className="flex gap-3">
              <span className="text-2xl font-bold text-sky-600">1</span>
              <div>
                <strong className="text-slate-900">Conecte sua conta TikTok Shop</strong>
                <p className="text-sm mt-1">
                  Veja seus próprios dados de performance e receba recomendações personalizadas.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-2xl font-bold text-sky-600">2</span>
              <div>
                <strong className="text-slate-900">Receba insights personalizados</strong>
                <p className="text-sm mt-1">
                  Scores de oportunidade baseados nos seus próprios produtos e conteúdo.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="text-2xl font-bold text-sky-600">3</span>
              <div>
                <strong className="text-slate-900">Opcional: Contribua com dados anônimos</strong>
                <p className="text-sm mt-1">
                  Ajude a comunidade com insights agregados. Você pode ativar ou desativar a qualquer momento.
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => setState({ ...state, step: 'connect' })}
            className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 min-h-[44px]"
          >
            Conectar TikTok Shop
          </button>
          <button
            onClick={handleSkip}
            className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            Pular por agora
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Sem penalidade. Você pode conectar depois quando quiser.
        </p>
      </div>
    );
  }

  if (state.step === 'connect') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Conectar TikTok Shop
        </h1>
        <p className="text-slate-600 mb-8">
          Vamos redirecionar você para o TikTok para autorizar o acesso aos seus dados.
        </p>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6 text-left">
          <h3 className="font-semibold text-slate-900 mb-3">O que vamos acessar:</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>✅ Seus produtos e detalhes</li>
            <li>✅ Suas métricas de performance (GMV, pedidos, comissão)</li>
            <li>✅ Seus vídeos e engajamento</li>
            <li>✅ Perfil da sua loja</li>
          </ul>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={handleConnect}
            disabled={state.connectionStatus === 'connecting'}
            className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 disabled:opacity-50 min-h-[44px]"
          >
            {state.connectionStatus === 'connecting' ? 'Conectando...' : 'Autorizar com TikTok'}
          </button>
          <button
            onClick={() => setState({ ...state, step: 'welcome' })}
            className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            Voltar
          </button>
        </div>

        {state.connectionStatus === 'error' && (
          <p className="mt-4 text-sm text-red-600">
            Erro ao conectar. Tente novamente.
          </p>
        )}
      </div>
    );
  }

  if (state.step === 'consent') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">
          Configurar consentimento
        </h1>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
          <h3 className="font-semibold text-slate-900 mb-3">Análise Pessoal</h3>
          <p className="text-sm text-slate-600 mb-3">
            Seus dados serão usados para gerar insights personalizados para você.
            Isso é necessário para usar a plataforma.
          </p>
          <p className="text-xs text-slate-500">
            Seus dados individuais nunca são expostos publicamente.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
          <h3 className="font-semibold text-slate-900 mb-3">Contribuição de Dados Agregados (Opcional)</h3>
          <p className="text-sm text-slate-600 mb-3">
            Compartilhe dados anônimos e agregados para ajudar a comunidade a entender melhor o mercado.
            Você pode desativar a qualquer momento.
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.aggregateContribution}
              onChange={(e) => setState({ ...state, aggregateContribution: e.target.checked })}
              className="h-4 w-4 accent-sky-600"
            />
            <span className="text-sm text-slate-700">
              Contribuir com dados agregados anônimos
            </span>
          </label>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6 space-y-4">
          <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-medium text-slate-700 mb-1">Política de Privacidade (v1.0)</p>
            <p>
              Seus dados de performance são usados exclusivamente para gerar insights
              pessoais. Dados agregados anônimos só são compartilhados com consentimento
              explícito. Você pode exportar ou excluir seus dados a qualquer momento (LGPD).
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.privacyPolicyAccepted}
              onChange={(e) => setState({ ...state, privacyPolicyAccepted: e.target.checked })}
              className="h-4 w-4 accent-sky-600"
            />
            <span className="text-sm text-slate-700">
              Li e aceito a Política de Privacidade (v1.0)
            </span>
          </label>

          <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-medium text-slate-700 mb-1">Termos de Uso (v1.0)</p>
            <p>
              Ao usar o TTSData, você concorda com os termos de uso da plataforma,
              incluindo as políticas de uso de dados da TikTok Shop API.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.termsAccepted}
              onChange={(e) => setState({ ...state, termsAccepted: e.target.checked })}
              className="h-4 w-4 accent-sky-600"
            />
            <span className="text-sm text-slate-700">
              Li e aceito os Termos de Uso (v1.0)
            </span>
          </label>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={handleConsent}
            disabled={!state.privacyPolicyAccepted || !state.termsAccepted}
            className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 disabled:opacity-50 min-h-[44px]"
          >
            Salvar preferências
          </button>
          <button
            onClick={handleSkip}
            className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            Sem penalidade, pular
          </button>
        </div>
      </div>
    );
  }

  // Complete
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-slate-900 mb-6">
        {state.connectionStatus === 'connected' ? 'Tudo configurado!' : 'Obrigado por se inscrever!'}
      </h1>

      {state.connectionStatus === 'connected' ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Sua conta TikTok Shop está conectada
          </h2>
          <p className="text-slate-600 mb-6">
            Recomendações personalizadas estão sendo geradas. Volte em breve para ver seus scores.
          </p>
          <a
            href="/products"
            className="inline-block rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 min-h-[44px]"
          >
            Explorar produtos
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Você pode conectar depois</h2>
          <p className="text-slate-600 mb-6">
            Vá para Configurações para conectar sua conta TikTok Shop e desbloquear recomendações personalizadas.
          </p>
          <a
            href="/products"
            className="inline-block rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 min-h-[44px]"
          >
            Explorar
          </a>
        </div>
      )}
    </div>
  );
}
