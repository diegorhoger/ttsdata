/**
 * TTSData Worker - Ingestion scheduler and scoring pipeline
 */

import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from './lib/db';
import { runScoringPipeline } from './lib/scoring';
import { ingestProducts } from './jobs/ingestProducts';
import { ingestSnapshots } from './jobs/ingestSnapshots';
import { calculateTrendSignals } from './jobs/calculateTrends';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Queues
const ingestionQueue = new Queue('ingestion', { connection: redis });
const scoringQueue = new Queue('scoring', { connection: redis });

// Workers
const ingestionWorker = new Worker('ingestion', async (job) => {
  console.log(`Processing job ${job.name}...`);
  
  switch (job.name) {
    case 'ingest-products':
      return await ingestProducts(job.data);
    case 'ingest-snapshots':
      return await ingestSnapshots(job.data);
    case 'calculate-trends':
      return await calculateTrendSignals(job.data);
    default:
      console.warn(`Unknown job: ${job.name}`);
  }
}, { connection: redis, concurrency: 5 });

const scoringWorker = new Worker('scoring', async (job) => {
  console.log(`Processing scoring job ${job.name}...`);
  
  if (job.name === 'run-scoring-pipeline') {
    return await runScoringPipeline(db, job.data.marketplace);
  }
}, { connection: redis });

// Schedule recurring jobs
async function scheduleJobs() {
  // Product ingestion every 6 hours
  await ingestionQueue.add('ingest-products', { marketplace: 'BR' }, {
    repeat: { pattern: '0 */6 * * *' },
    jobId: 'ingest-products-br',
  });

  // Snapshot ingestion every 3 hours
  await ingestionQueue.add('ingest-snapshots', { marketplace: 'BR' }, {
    repeat: { pattern: '0 */3 * * *' },
    jobId: 'ingest-snapshots-br',
  });

  // Trend calculation every 2 hours
  await ingestionQueue.add('calculate-trends', { marketplace: 'BR' }, {
    repeat: { pattern: '0 */2 * * *' },
    jobId: 'calculate-trends-br',
  });

  // Scoring pipeline every 4 hours
  await scoringQueue.add('run-scoring-pipeline', { marketplace: 'BR' }, {
    repeat: { pattern: '0 */4 * * *' },
    jobId: 'scoring-pipeline-br',
  });

  console.log('Scheduled recurring jobs');
}

async function main() {
  console.log('TTSData Worker starting...');
  
  await scheduleJobs();
  
  console.log('Workers ready');
}

main().catch(console.error);
