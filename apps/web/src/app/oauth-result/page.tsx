"use client";

import { useState, useEffect } from "react";
import { verifyProbeCookie } from "../api/auth/tiktok/callback/route";

export default function OAuthResultPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read probe result from cookie (set by callback)
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("ttsdata_probe_result="))
      ?.split("=")[1];

    if (cookieValue) {
      try {
        const decoded = Buffer.from(cookieValue, "base64url").toString();
        const lastDot = decoded.lastIndexOf(".");
        if (lastDot !== -1) {
          const payload = decoded.slice(0, lastDot);
          const data = JSON.parse(payload);
          setResult(data);
        }
      } catch (err) {
        setError("Failed to decode probe results");
      }
    } else {
      setError("No probe results found");
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded mx-auto"></div>
          <div className="h-4 w-48 bg-slate-100 rounded mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-xl bg-red-50 border border-red-200 p-8 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-900 mb-4">Erro na verificação</h1>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          ✅ Verificação OAuth Concluída
        </h1>
        <p className="text-slate-600">
          Escopos autorizados: {result?.scopes || "N/A"}
        </p>
      </div>

      <div className="space-y-6">
        {/* User Info */}
        {result?.data?.userInfo && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">User Info</h2>
            <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(result.data.userInfo, null, 2)}
            </pre>
          </div>
        )}

        {/* Video List */}
        {result?.data?.videoList && (
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Video List</h2>
            <pre className="text-xs bg-slate-50 p-4 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(result.data.videoList, null, 2)}
            </pre>
          </div>
        )}

        {/* Errors */}
        {result?.data?.errors?.length > 0 && (
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
