/**
 * Server-side probe result store for TikTok Display API verification.
 * In-memory store with TTL (use Redis in production).
 * 
 * Results are keyed by a random one-time ID and deleted immediately after retrieval.
 */

interface ProbeResult {
  data: any;
  timestamp: number;
  scopes: string;
  bothSucceeded: boolean;
}

const store = new Map<string, ProbeResult>();
const PROBE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function storeProbeResult(id: string, result: ProbeResult): void {
  store.set(id, result);
}

export function getProbeResult(id: string): ProbeResult | null {
  const result = store.get(id);
  if (!result) return null;
  
  // Check TTL
  if (Date.now() - result.timestamp > PROBE_TTL_MS) {
    store.delete(id);
    return null;
  }
  
  return result;
}

export function deleteProbeResult(id: string): void {
  store.delete(id);
}

export function clearExpiredResults(): void {
  const now = Date.now();
  for (const [id, result] of store.entries()) {
    if (now - result.timestamp > PROBE_TTL_MS) {
      store.delete(id);
    }
  }
}
