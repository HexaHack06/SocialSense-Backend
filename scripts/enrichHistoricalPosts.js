#!/usr/bin/env node

/**
 * Historical Post AI Enrichment CLI Script (Phase 6.6)
 *
 * Usage:
 *   node scripts/enrichHistoricalPosts.js [options]
 *
 * Options:
 *   --dry-run             Simulate without writing to MongoDB
 *   --limit=<number>      Limit number of posts to process (e.g. --limit=100)
 *   --batch-size=<number> Batch size for MongoDB pagination (default: 50)
 *   --force               Reprocess posts even if already enriched
 *   --help                Display help message
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { enrichHistoricalTwitterPosts } = require('../src/services/historicalAiEnrichmentService');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    limit: 0,
    batchSize: 50,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10) || 0;
    } else if (arg === '--limit' || arg === '-l') {
      options.limit = parseInt(args[++i], 10) || 0;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10) || 50;
    } else if (arg === '--batch-size' || arg === '-b') {
      options.batchSize = parseInt(args[++i], 10) || 50;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
SocialSense AI - Historical Post Enrichment CLI (Phase 6.6)

Usage:
  node scripts/enrichHistoricalPosts.js [options]

Options:
  --dry-run, -d             Simulate enrichment without modifying MongoDB
  --limit=<N>, -l <N>       Limit the number of posts to process (e.g. --limit=100)
  --batch-size=<N>, -b <N>  Number of posts per batch (default: 50)
  --force, -f               Reprocess posts even if already enriched
  --help, -h                Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
};

const main = async () => {
  const options = parseArgs();
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Error: MONGO_URI is not set in environment variables (.env).');
    process.exit(1);
  }

  console.log('======================================================================');
  console.log('SOCIALSENSE HISTORICAL POST AI ENRICHMENT');
  console.log('======================================================================');
  console.log(`Target Platform : Twitter / X`);
  console.log(`Dry-Run Mode    : ${options.dryRun ? 'ENABLED (no DB writes)' : 'DISABLED (writing to DB)'}`);
  console.log(`Force Reprocess : ${options.force ? 'YES' : 'NO'}`);
  console.log(`Post Limit      : ${options.limit > 0 ? options.limit : 'ALL'}`);
  console.log(`Batch Size      : ${options.batchSize}`);
  console.log('======================================================================');

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB.');

    const startTime = Date.now();
    const stats = await enrichHistoricalTwitterPosts(options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n======================================================================');
    console.log('ENRICHMENT SUMMARY');
    console.log('======================================================================');
    console.log(`Duration   : ${duration}s`);
    console.log(`Processed  : ${stats.processed}`);
    console.log(`Enriched   : ${stats.enriched}${stats.dryRun ? ' (Simulated)' : ''}`);
    console.log(`Skipped    : ${stats.skipped}`);
    console.log(`Failed     : ${stats.failed}`);
    console.log('======================================================================');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    if (stats.failed > 0 && stats.enriched === 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal error during historical post enrichment:', err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exitCode = 1;
  }
};

main();
