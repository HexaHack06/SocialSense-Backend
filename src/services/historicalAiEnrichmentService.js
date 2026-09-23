/**
 * Historical AI Enrichment Service (Phase 6.6)
 *
 * Enriches existing historical X/Twitter posts in MongoDB with:
 * - sentiment
 * - topicName
 * - topicId
 * - keywords
 *
 * Processes posts in batches with cursor-based pagination, safe error handling,
 * dry-run support, and progress reporting.
 */

const Post = require('../models/Post');
const { analyzeSentiment } = require('./aiService');

/**
 * Checks whether a post document already has all AI enrichment fields populated.
 */
const isPostEnriched = (post) => {
  return Boolean(
    post.sentiment &&
    post.topicName &&
    post.topicId &&
    Array.isArray(post.keywords) &&
    post.keywords.length > 0
  );
};

/**
 * Builds the MongoDB query to find target posts.
 */
const buildEnrichmentQuery = (force = false) => {
  if (force) {
    return { platform: 'twitter' };
  }

  return {
    platform: 'twitter',
    $or: [
      { keywords: { $exists: false } },
      { keywords: { $size: 0 } },
      { topicName: { $exists: false } },
      { topicName: null },
      { topicId: { $exists: false } },
      { topicId: null },
      { sentiment: { $exists: false } },
      { sentiment: null }
    ]
  };
};

/**
 * Evaluates a single post for enrichment.
 * Does NOT write to MongoDB directly.
 *
 * @param {Object} post - The post document/object
 * @param {boolean} force - Whether to re-enrich already enriched posts
 * @returns {Promise<{ status: 'enriched' | 'skipped' | 'failed', id: any, data?: Object, reason?: string }>}
 */
const evaluatePostForEnrichment = async (post, force = false) => {
  if (!post) {
    return { status: 'skipped', reason: 'null_post' };
  }

  const text = typeof post.text === 'string' ? post.text.trim() : '';

  // 1. Safe handling for empty text
  if (!text) {
    return { status: 'skipped', reason: 'empty_text', id: post._id };
  }

  // 2. Skip already enriched posts unless force is enabled
  if (!force && isPostEnriched(post)) {
    return { status: 'skipped', reason: 'already_enriched', id: post._id };
  }

  // 3. Call AI service helper
  try {
    const aiResult = await analyzeSentiment(text);

    if (!aiResult || (aiResult.success === false && !aiResult.fallback)) {
      return { status: 'failed', reason: 'ai_service_error', id: post._id };
    }

    const topic = aiResult.topic || 'General';

    return {
      status: 'enriched',
      id: post._id,
      data: {
        sentiment: aiResult.sentiment || 'Neutral',
        topicName: topic,
        topicId: topic.toLowerCase(),
        keywords: Array.isArray(aiResult.keywords) ? aiResult.keywords : []
      }
    };
  } catch (err) {
    return { status: 'failed', reason: err.message, id: post._id };
  }
};

/**
 * Enriches historical X/Twitter posts in MongoDB.
 *
 * @param {Object} options
 * @param {number} [options.limit=0] - Maximum number of posts to process (0 = all)
 * @param {number} [options.batchSize=50] - Number of posts per batch
 * @param {boolean} [options.dryRun=false] - If true, simulate without modifying MongoDB
 * @param {boolean} [options.force=false] - If true, reprocess already enriched posts
 * @param {Function} [options.onProgress] - Optional callback receiving { processed, enriched, skipped, failed }
 *
 * @returns {Promise<{ processed: number, enriched: number, skipped: number, failed: number, dryRun: boolean }>}
 */
const enrichHistoricalTwitterPosts = async (options = {}) => {
  const {
    limit = 0,
    batchSize = 50,
    dryRun = false,
    force = false,
    onProgress = null
  } = options;

  const stats = {
    processed: 0,
    enriched: 0,
    skipped: 0,
    failed: 0,
    dryRun
  };

  const query = buildEnrichmentQuery(force);
  const targetLimit = limit > 0 ? limit : Infinity;

  console.log(`\n--- Starting Historical AI Enrichment ---`);
  console.log(`Parameters: limit=${limit > 0 ? limit : 'ALL'}, batchSize=${batchSize}, dryRun=${dryRun}, force=${force}`);

  let lastId = null;

  while (stats.processed < targetLimit) {
    const currentBatchLimit = Math.min(batchSize, targetLimit - stats.processed);
    const batchQuery = { ...query };

    if (lastId) {
      batchQuery._id = { $gt: lastId };
    }

    let batchDocs = [];
    try {
      batchDocs = await Post.find(batchQuery)
        .sort({ _id: 1 })
        .limit(currentBatchLimit)
        .lean();
    } catch (dbErr) {
      console.error('MongoDB query error while fetching batch:', dbErr.message);
      stats.failed += currentBatchLimit;
      break;
    }

    if (!batchDocs || batchDocs.length === 0) {
      // No more matching documents found
      break;
    }

    lastId = batchDocs[batchDocs.length - 1]._id;

    // Process items in this batch concurrently
    const evalResults = await Promise.all(
      batchDocs.map(doc => evaluatePostForEnrichment(doc, force))
    );

    const bulkOps = [];

    for (const res of evalResults) {
      stats.processed++;

      if (res.status === 'enriched') {
        bulkOps.push({
          updateOne: {
            filter: { _id: res.id },
            update: { $set: res.data }
          }
        });
      } else if (res.status === 'skipped') {
        stats.skipped++;
      } else if (res.status === 'failed') {
        stats.failed++;
      }
    }

    // Persist to MongoDB if not dry-run
    if (bulkOps.length > 0) {
      if (!dryRun) {
        try {
          await Post.bulkWrite(bulkOps, { ordered: false });
          stats.enriched += bulkOps.length;
        } catch (writeErr) {
          console.error('MongoDB bulkWrite error:', writeErr.message);
          // If bulk write fails, record as failed
          stats.failed += bulkOps.length;
        }
      } else {
        // In dry-run mode, count as enriched for simulation
        stats.enriched += bulkOps.length;
      }
    }

    // Progress logging
    console.log(`Processed: ${stats.processed} | Enriched: ${stats.enriched} | Skipped: ${stats.skipped} | Failed: ${stats.failed}${dryRun ? ' (DRY-RUN)' : ''}`);

    if (typeof onProgress === 'function') {
      onProgress({ ...stats });
    }
  }

  console.log(`\n--- Historical AI Enrichment Finished ---`);
  console.log(`Total Processed: ${stats.processed}`);
  console.log(`Total Enriched:  ${stats.enriched}${dryRun ? ' (Dry-Run, not saved)' : ''}`);
  console.log(`Total Skipped:   ${stats.skipped}`);
  console.log(`Total Failed:    ${stats.failed}`);

  return stats;
};

module.exports = {
  enrichHistoricalTwitterPosts,
  evaluatePostForEnrichment,
  isPostEnriched,
  buildEnrichmentQuery
};
