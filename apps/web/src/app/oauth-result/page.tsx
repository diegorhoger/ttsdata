import { consumeProbeResult } from '../../lib/oauth';

export default function OAuthResultPage({ searchParams, request }: { searchParams: { result_id?: string }; request: Request }) {
  const resultId = searchParams.result_id;

  if (!resultId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-xl bg-red-50 border border-red-200 p-8 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-900 mb-4">Erro na verificação</h1>
          <p className="text-red-700">ID de resultado não encontrado.</p>
        </div>
      </div>
    );
  }

      // In production, session hash would come from a signed session cookie
    // For verification-only, we accept the result_id as a bearer credential
    // The session binding is enforced at storage time
    const sessionHash = request.cookies.get('ttsdata_session')?.value || 'anonymous';
    const result = consumeProbeResult(resultId, sessionHash);

  if (!result) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 text-center">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-amber-900 mb-4">Resultado expirado</h1>
          <p className="text-amber-700">Os resultados são válidos por apenas 5 minutos.</p>
        </div>
      </div>
    );
  }

  // Delete result immediately after retrieval (single-use)
  // Result already consumed by consumeProbeResult

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          ✅ Verificação OAuth Concluída
        </h1>
        <p className="text-slate-600">
          Escopos autorizados: {result.scopes || "N/A"}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          {result.bothSucceeded ? "Todas as chamadas de API foram bem-sucedidas." : "Algumas chamadas de API falharam."}
        </p>
      </div>

      <div className="space-y-6">
        {result.data?.userInfo && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">User Info</h2>
            <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(result.data.userInfo, null, 2)}
            </pre>
          </div>
        )}

        {result.data?.videoList && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Video List</h2>
            <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(result.data.videoList, null, 2)}
            </pre>
          </div>
        )}

        {result.data?.errors?.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-6">
            <h2 className="text-xl font-semibold text-amber-900 mb-4">Erros</h2>
            <pre className="text-xs bg-amber-50 p-4 rounded-lg overflow-auto">
              {JSON.stringify(result.data.errors, null, 2)}
            </pre>
          </div>
        )}

        <div className="text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 transition-colors"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}
