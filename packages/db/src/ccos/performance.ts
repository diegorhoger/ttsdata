export const PERFORMANCE_METRICS = ['views', 'clicks', 'orders', 'gmv', 'commission', 'conversion'] as const;
export type PerformanceMetric = typeof PERFORMANCE_METRICS[number];
export const PERFORMANCE_METRIC_UNITS: Record<PerformanceMetric, 'count' | 'currency' | 'ratio'> = {
  views: 'count', clicks: 'count', orders: 'count', gmv: 'currency', commission: 'currency', conversion: 'ratio',
};
export type MetricClassification = 'observed' | 'calculated' | 'inferred' | 'self-reported' | 'unavailable';
export const PERFORMANCE_WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;
export type PerformanceWindow = keyof typeof PERFORMANCE_WINDOWS;

export interface PerformanceSnapshot {
  id: string;
  workspaceId: string;
  contentId: string;
  productId: string;
  observedAt: Date;
  views: number | null;
  clicks: number | null;
  orders: number | null;
  gmv: string | null;
  commission: string | null;
  conversion: string | null;
  currency: string | null;
  classifications: Record<PerformanceMetric, MetricClassification>;
  provenance: { schemaVersion: 1; source: string; metrics: Partial<Record<PerformanceMetric, unknown>> };
  createdAt: Date;
}

export interface MetricComparison {
  baselineAt: Date | null;
  values: Record<PerformanceMetric, { current: number | string | null; baseline: number | string | null; delta: number | string | null }>;
}

function decimalDelta(current: string, baseline: string, scale: number): string {
  const units = (value: string): bigint => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, '0').slice(0, scale) || '0');
  };
  const difference = units(current) - units(baseline);
  const sign = difference < 0n ? '-' : '';
  const absolute = difference < 0n ? -difference : difference;
  const whole = absolute / (10n ** BigInt(scale));
  const fraction = (absolute % (10n ** BigInt(scale))).toString().padStart(scale, '0').replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** For each requested horizon, use the nearest snapshot at or before the exact cutoff.
 * Missing baselines and missing values remain null; no interpolation or zero-filling occurs.
 */
export function comparePerformanceSnapshots(
  snapshots: PerformanceSnapshot[],
  current: PerformanceSnapshot,
): Record<PerformanceWindow, MetricComparison> {
  const metrics = PERFORMANCE_METRICS;
  const result = {} as Record<PerformanceWindow, MetricComparison>;
  for (const [window, duration] of Object.entries(PERFORMANCE_WINDOWS) as [PerformanceWindow, number][]) {
    const cutoff = current.observedAt.getTime() - duration;
    const baseline = snapshots
      .filter((item) => item.contentId === current.contentId && item.workspaceId === current.workspaceId
        && item.observedAt.getTime() <= cutoff)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || a.id.localeCompare(b.id))[0];
    const values = {} as MetricComparison['values'];
    for (const metric of metrics) {
      const currentValue = current[metric];
      const baselineValue = baseline?.[metric] ?? null;
      const delta = currentValue === null || baselineValue === null
        ? null
        : metric === 'gmv' || metric === 'commission'
          ? current.currency !== baseline?.currency || current.currency === null
            ? null
            : decimalDelta(String(currentValue), String(baselineValue), 6)
          : metric === 'conversion'
            ? decimalDelta(String(currentValue), String(baselineValue), 8)
            : Number(currentValue) - Number(baselineValue);
      values[metric] = { current: currentValue, baseline: baselineValue, delta };
    }
    result[window] = { baselineAt: baseline?.observedAt ?? null, values };
  }
  return result;
}
