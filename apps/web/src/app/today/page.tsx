"use client";

import { useState, useEffect } from "react";

export default function TodayPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded"></div>
          <div className="h-64 bg-slate-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Hoje</h1>
        <p className="text-slate-600">Produtos em alta e oportunidades do dia.</p>
      </div>
      <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-slate-200">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Em breve</h2>
        <p className="text-slate-500">
          A página "Hoje" estará disponível após a implementação da API de dados.
        </p>
      </div>
    </div>
  );
}
