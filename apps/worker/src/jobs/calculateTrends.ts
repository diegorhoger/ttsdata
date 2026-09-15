/**
 * Calculate trend signals and lifecycle states
 */

import { db } from '../lib/db';
import { products, productSnapshots, trendSignals } from '@ttsdata/db/src/schema';
import { eq, sql, and, desc } from 'drizzle-orm';

interface CalculateTrendsData {
  marketplace: string;
}

export async function calculateTrendSignals(data: CalculateTrendsData) {
  console.log(`Calculating trends for ${data.marketplace}...`);
  
  const activeProducts = await db.query.products.findMany({
    where: eq(products.marketplace, data.marketplace),
  });

  let calculated = 0;

  for (const product of activeProducts) {
    // Get recent snapshots
    const recentSnapshots = await db.query.productSnapshots.findMany({
      where: eq(productSnapshots.productId, product.id),
      orderBy: desc(productSnapshots.observedAt),
      limit: 30,
    });

    if (recentSnapshots.length < 2) continue;

    // Calculate growth rate (7-day window)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekSnapshots = recentSnapshots.filter(
      (s: any) => new Date(s.observedAt) >= sevenDaysAgo
    );

    if (weekSnapshots.length < 2) continue;

    const latestWeek = weekSnapshots[0];
    const oldestWeek = weekSnapshots[weekSnapshots.length - 1];

    // Sales-based growth
    const latestSales = latestWeek.salesVolume || 0;
    const oldestSales = oldestWeek.salesVolume || 0;
    const growthRate = oldestSales > 0 ? (latestSales - oldestSales) / oldestSales : 0;

    // Classify lifecycle
    let lifecycle: 'emerging' | 'growing' | 'mature' | 'declining' | 'insufficient-data';
    
    if (weekSnapshots.length < 3) {
      lifecycle = 'insufficient-data';
    } else if (growthRate > 0.5) {
      lifecycle = 'emerging';
    } else if (growthRate > 0.1) {
      lifecycle = 'growing';
    } else if (growthRate > -0.1) {
      lifecycle = 'mature';
    } else {
      lifecycle = 'declining';
    }

    await db.insert(trendSignals).values({
      productId: product.id,
      window: '7d',
      growthRate: growthRate.toString(),
      acceleration: '0', // Simplified
      lifecycle,
      confidence: weekSnapshots.length >= 7 ? 'high' : weekSnapshots.length >= 3 ? 'medium' : 'low',
      calculatedAt: new Date(),
    });

    calculated++;
  }

  console.log(`Calculated trends for ${calculated} products`);
  return { calculated };
}
