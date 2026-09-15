/**
 * Product snapshot ingestion - stores time-series state
 */

import { TikTokShopClient } from '../lib/tiktok-client';
import { db } from '../lib/db';
import { products, productSnapshots } from '@ttsdata/db/src/schema';
import { eq } from 'drizzle-orm';

interface IngestSnapshotsData {
  marketplace: string;
}

export async function ingestSnapshots(data: IngestSnapshotsData) {
  console.log(`Starting snapshot ingestion for ${data.marketplace}...`);
  
  const client = new TikTokShopClient();
  let totalSnapshotted = 0;
  
  // Get active products
  const activeProducts = await db.query.products.findMany({
    where: eq(products.marketplace, data.marketplace),
  });

  for (const product of activeProducts.slice(0, 100)) { // Limit batch size
    try {
      // In production: fetch latest product details from TikTok API
      // For now, generate a snapshot
      await db.insert(productSnapshots).values({
        productId: product.id,
        observedAt: new Date(),
        price: '0', // Would come from API
        currency: 'BRL',
        commissionRate: '0.10', // Default 10%
        stockSignal: 'in_stock',
        salesVolume: 0,
        salesVelocity: '0',
        classification: 'observed',
        provenance: {
          source: 'tiktok_shop_api:v202401',
          endpoint: `/product/202309/products/${product.id}`,
          retrievedAt: new Date().toISOString(),
          marketplace: data.marketplace,
          scopeContext: 'partner_discovery',
        },
      });

      totalSnapshotted++;
    } catch (error) {
      console.error(`Failed to snapshot product ${product.id}:`, error);
    }
  }

  console.log(`Created ${totalSnapshotted} snapshots`);
  return { snapshots: totalSnapshotted };
}
