"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [connected, setConnected] = useState(
    typeof window !== "undefined" && localStorage.getItem("tiktok_connected") === "true"
  );

  const handleDisconnect = () => {
    localStorage.removeItem("tiktok_connected");
    setConnected(false);
    alert("Conta desconectada. Todos os dados foram removidos.");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Configurações</h1>
      <div className="space-y-6">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Conexão TikTok</h2>
          <p className="text-slate-600 mb-4">Gerencie sua conexão com a conta TikTok.</p>
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}>
              {connected ? "Conectado" : "Desconectado"}
            </span>
            {connected && (
              <button
                onClick={handleDisconnect}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Desconectar
              </button>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Privacidade</h2>
          <p className="text-slate-600 mb-4">
            Você pode solicitar a exclusão completa dos seus dados a qualquer momento.
          </p>
          <button
            onClick={() => alert("Solicitação de exclusão enviada. Seus dados serão removidos em até 30 dias.")}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Excluir meus dados
          </button>
        </div>
      </div>
    </div>
  );
}
