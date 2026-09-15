/**
 * Product ingestion job
 */

import { TikTokShopClient } from '../lib/tiktok-client';
import { db } from '../lib/db';
import { products, shops } from '@ttsdata/db/src/schema';
import { eq } from 'drizzle-orm';

interface IngestProductsData {
  marketplace: string;
  categoryId?: string;
}

export async function ingestProducts(data: IngestProductsData) {
  console.log(`Starting product ingestion for ${data.marketplace}...`);
  
  const client = new TikTokShopClient();
  let totalIngested = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      // In production, this would use the actual TikTok API
      // For now, we'll create placeholder data
      console.log(`Fetching page ${page}...`);
      
      // Simulate API call
      const response: any = await client.getProducts({
        pageSize: 50,
        pageNumber: page,
        categoryId: data.categoryId,
      });

      // Process response
      const items: any[] = response?.data?.products || [];
      
      for (const item of items) {
        await db.insert(products).values({
          id: item.product_id,
          marketplace: data.marketplace,
          title: item.product_name || 'Unknown',
          description: item.description,
          categoryId: item.category_id,
          categoryPath: item.category_path,
          imageUrl: item.main_image_url,
          shopId: item.shop_id,
          status: item.status || 'active',
        }).onConflictDoUpdate({
          target: products.id,
          set: {
            title: item.product_name,
            status: item.status,
            updatedAt: new Date(),
          },
        });

        totalIngested++;
      }

      hasMore = items.length === 50;
      page++;
      
      // Rate limiting pause
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Ingestion error:', error);
      break;
    }
  }

  console.log(`Ingested ${totalIngested} products`);
  return { ingested: totalIngested };
}
