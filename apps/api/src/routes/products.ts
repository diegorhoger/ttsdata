/**
 * Product routes - search, filter, sort, detail
 * PRD §10 (scoring), §11 (UX information architecture)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../lib/db';
import { 
  products, productSnapshots, shops, videos, creators, 
  productCreatorLinks, opportunityScores, saturationScores, trendSignals 
} from '@ttsdata/db/src/schema';

const searchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().optional(),
  shopId: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minCommission: z.coerce.number().optional(),
  maxCommission: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  minCreators: z.coerce.number().optional(),
  lifecycle: z.enum(['emerging', 'growing', 'mature', 'declining']).optional(),
  sort: z.enum(['opportunity', 'momentum', 'commission', 'freshness', 'price_asc', 'price_desc']).default('opportunity'),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export async function registerProductRoutes(app: FastifyInstance) {
  
  // GET /api/products - Search & filter
  app.get('/', async (request, reply) => {
    const params = searchSchema.parse(request.query);

    // Build dynamic where conditions
    const conditions: any[] = [sql`TRUE`];
    const aliases: Record<string, any> = {};
    
    if (params.q) {
      conditions.push(sql`(
        p.title ILIKE ${`%${params.q}%`} OR 
        s.name ILIKE ${`%${params.q}%`}
      )`);
    }
    if (params.categoryId) {
      conditions.push(sql`p.category_id = ${params.categoryId}`);
    }
    if (params.shopId) {
      conditions.push(sql`p.shop_id = ${params.shopId}`);
    }

    // Price range (from latest snapshot)
    if (params.minPrice !== undefined) {
      aliases.minPrice = params.minPrice;
    }
    if (params.maxPrice !== undefined) {
      aliases.maxPrice = params.maxPrice;
    }

    // Sort mapping
    const sortMap: Record<string, any> = {
      opportunity: 'COALESCE(os.score, 0) DESC',
      momentum: 'COALESCE(ts.growth_rate, 0) DESC',
      commission: 'COALESCE(latest.commission_rate, 0) DESC',
      freshness: 'p.last_observed_at DESC NULLS LAST',
      price_asc: 'latest.price ASC',
      price_desc: 'latest.price DESC',
    };

    const offset = (params.page - 1) * params.limit;

    // Main query
    const query = sql`
      WITH latest AS (
        SELECT DISTINCT ON (product_id) *
        FROM product_snapshots
        ORDER BY product_id, observed_at DESC
      ),
      creator_count AS (
        SELECT product_id, COUNT(DISTINCT creator_id) as cnt
        FROM product_creator_links
        GROUP BY product_id
      )
      SELECT 
        p.id, p.title, p.image_url, p.category_id, p.shop_id, p.status,
        p.last_observed_at, p.created_at,
        s.name as shop_name,
        latest.price, latest.currency, latest.commission_rate, latest.stock_signal,
        latest.rating, latest.review_count, latest.sales_volume,
        COALESCE(cc.cnt, 0) as creator_count,
        os.score as opportunity_score,
        os.confidence as opportunity_confidence,
        os.components as opportunity_components,
        ss.level as saturation_level,
        ss.score as saturation_score,
        ts.growth_rate as momentum_growth_rate,
        ts.lifecycle as trend_lifecycle,
        COUNT(*) OVER() as total_count
      FROM products p
      LEFT JOIN shops s ON p.shop_id = s.id
      LEFT JOIN latest ON p.id = latest.product_id
      LEFT JOIN creator_count cc ON p.id = cc.product_id
      LEFT JOIN opportunity_scores os ON p.id = os.product_id 
        AND os.version = 'v1' AND os.calculated_at = (
          SELECT MAX(calculated_at) FROM opportunity_scores WHERE product_id = p.id AND version = 'v1'
        )
      LEFT JOIN saturation_scores ss ON p.id = ss.product_id
        AND ss.version = 'v1' AND ss.calculated_at = (
          SELECT MAX(calculated_at) FROM saturation_scores WHERE product_id = p.id AND version = 'v1'
        )
      LEFT JOIN trend_signals ts ON p.id = ts.product_id
        AND ts."window" = '7d' AND ts.calculated_at = (
          SELECT MAX(calculated_at) FROM trend_signals WHERE product_id = p.id AND "window" = '7d'
        )
      WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}
      ORDER BY ${sql.raw(sortMap[params.sort])}
      LIMIT ${params.limit} OFFSET ${offset}
    `;

    const result = await db.execute(query) as any;
    const total = result.rows[0]?.total_count || 0;

    return reply.send({
      data: result.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        imageUrl: row.image_url,
        categoryId: row.category_id,
        shopId: row.shop_id,
        shopName: row.shop_name,
        status: row.status,
        price: {
          value: parseFloat(row.price) || 0,
          currency: row.currency,
          classification: 'observed',
        },
        commissionRate: {
          value: parseFloat(row.commission_rate) || 0,
          classification: 'observed',
        },
        stockSignal: row.stock_signal,
        rating: row.rating ? parseFloat(row.rating) : null,
        reviewCount: row.review_count,
        salesVolume: row.sales_volume,
        creatorCount: parseInt(row.creator_count) || 0,
        opportunityScore: row.opportunity_score,
        opportunityConfidence: row.opportunity_confidence,
        opportunityComponents: row.opportunity_components,
        saturationLevel: row.saturation_level,
        saturationScore: row.saturation_score,
        momentumGrowthRate: row.momentum_growth_rate ? parseFloat(row.momentum_growth_rate) : null,
        trendLifecycle: row.trend_lifecycle,
        lastObservedAt: row.last_observed_at,
      })),
      pagination: {
        page: params.page,
        limit: params.limit,
        total: parseInt(total || '0'),
        totalPages: Math.ceil(parseInt(total || '0') / params.limit),
      },
    });
  });

  // GET /api/products/:id - Product detail
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = (await db.query.products.findFirst({
      where: eq(products.id, id),
      with: {
        shop: true,  
      },
    })) as any;

    if (!product) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Product not found' });
    }

    // Latest snapshot
    const latestSnapshot = (await db.query.productSnapshots.findFirst({
      where: eq(productSnapshots.productId, id),
      orderBy: desc(productSnapshots.observedAt),
    })) as any;

    // Historical snapshots (last 30 days)
    const history = await db.query.productSnapshots.findMany({
      where: and(
        eq(productSnapshots.productId, id),
        gte(productSnapshots.observedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      ),
      orderBy: productSnapshots.observedAt,
    });

    // Linked creators
    const linkedCreators = (await db.query.productCreatorLinks.findMany({
      where: eq(productCreatorLinks.productId, id),
      with: { creator: true },
      limit: 20,
    })) as any[];

    // Linked videos
    const linkedVideos = (await db.query.videos.findMany({
      where: eq(videos.productId, id),
      orderBy: desc(videos.publishedAt),
      limit: 20,
    })) as any[];

    // Current scores
    const oppScore = (await db.query.opportunityScores.findFirst({
      where: eq(opportunityScores.productId, id),
      orderBy: desc(opportunityScores.calculatedAt),
    })) as any;

    const satScore = (await db.query.saturationScores.findFirst({
      where: eq(saturationScores.productId, id),
      orderBy: desc(saturationScores.calculatedAt),
    })) as any;

    const trend = (await db.query.trendSignals.findFirst({
      where: and(
        eq(trendSignals.productId, id),
        eq(trendSignals.window, '7d')
      ),
      orderBy: desc(trendSignals.calculatedAt),
    })) as any;

    return reply.send({
      product: {
        id: product.id,
        title: product.title,
        description: product.description,
        imageUrl: product.imageUrl,
        categoryId: product.categoryId,
        categoryPath: product.categoryPath,
        shop: product.shop,
        status: product.status,
        lastObservedAt: product.lastObservedAt,
      },
      currentMetrics: latestSnapshot ? {
        price: { value: parseFloat(latestSnapshot.price), currency: latestSnapshot.currency, classification: 'observed' },
        commissionRate: { value: parseFloat(latestSnapshot.commissionRate), classification: 'observed' },
        stockSignal: latestSnapshot.stockSignal,
        rating: latestSnapshot.rating ? parseFloat(latestSnapshot.rating) : null,
        reviewCount: latestSnapshot.reviewCount,
        salesVolume: latestSnapshot.salesVolume,
        salesVelocity: latestSnapshot.salesVelocity ? parseFloat(latestSnapshot.salesVelocity) : null,
      } : null,
      history: history.map((h: any) => ({
        observedAt: h.observedAt,
        price: parseFloat(h.price),
        commissionRate: parseFloat(h.commissionRate),
        rating: h.rating ? parseFloat(h.rating) : null,
        salesVolume: h.salesVolume,
      })),
      linkedCreators: linkedCreators.map((lc: any) => ({
        id: lc.creator.id,
        displayName: lc.creator.displayName,
        avatarUrl: lc.creator.avatarUrl,
        followerCount: lc.creator.followerCount,
        firstObservedAt: lc.firstObservedAt,
      })),
      linkedVideos: linkedVideos.map((v: any) => ({
        id: v.id,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        publishedAt: v.publishedAt,
      })),
      opportunityScore: oppScore ? {
        score: oppScore.score,
        confidence: oppScore.confidence,
        components: oppScore.components,
        calculatedAt: oppScore.calculatedAt,
      } : null,
      saturationScore: satScore ? {
        level: satScore.level,
        score: satScore.score,
        factors: satScore.factors,
        explanation: satScore.explanation,
        calculatedAt: satScore.calculatedAt,
      } : null,
      trend: trend ? {
        window: trend.window,
        growthRate: parseFloat(trend.growthRate),
        acceleration: parseFloat(trend.acceleration),
        lifecycle: trend.lifecycle,
        confidence: trend.confidence,
        calculatedAt: trend.calculatedAt,
      } : null,
    });
  });

  // GET /api/products/categories - Category list
  app.get('/categories', async (request, reply) => {
    const result = await db.execute(sql`
      SELECT category_id, COUNT(*) as product_count
      FROM products
      WHERE category_id IS NOT NULL
      GROUP BY category_id
      ORDER BY product_count DESC
    `);

    return reply.send({
      categories: result.rows.map((r: any) => ({
        id: r.category_id,
        productCount: parseInt(r.product_count),
      })),
    });
  });
}
