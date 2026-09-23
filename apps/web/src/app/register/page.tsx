"use client";

import { useEffect } from "react";

/**
 * Register page — redirects to TikTok OAuth flow.
 * Account is created automatically after first TikTok authorization.
 */
export default function RegisterPage() {
  useEffect(() => {
    // Redirect to TikTok connect flow
    window.location.href = "/connect";
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded mx-auto"></div>
        <div className="h-4 w-48 bg-slate-100 rounded mx-auto"></div>
        <p className="text-slate-500">Redirecionando para o TikTok...</p>
      </div>
    </div>
  );
}
