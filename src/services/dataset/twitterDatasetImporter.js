const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const Post = require('../../models/Post');
const { analyzeTweet } = require('../nlp/historicalTextAnalyzer');
const { analyzeSentiment } = require('../aiService');

/**
 * Extract hashtags from text
 */
const extractHashtags = (text) => {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/#[\w\u0590-\u05ff]+/g);
  return matches ? Array.from(new Set(matches)) : [];
};

/**
 * Extract @mentions from text
 */
const extractMentions = (text) => {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/@\w+/g);
  return matches ? Array.from(new Set(matches)) : [];
};

/**
 * Generate a deterministic ID based on stable row content
 */
const generateDeterministicId = (text, identifier = '') => {
  return crypto
    .createHash('sha256')
    .update(`twitter:${String(text || '').trim()}:${String(identifier || '').trim()}`)
    .digest('hex')
    .substring(0, 24);
};

/**
 * Locate the available dataset file in known locations
 */
const resolveDatasetPath = (customPath) => {
  if (customPath) {
    const resolvedCustom = path.isAbsolute(customPath)
      ? customPath
      : path.resolve(process.cwd(), customPath);
    return fs.existsSync(resolvedCustom) ? resolvedCustom : null;
  }

  const potentialPaths = [
    path.join(__dirname, '../../../data/Truth_Seeker_Model_Dataset.csv'),
    path.join(__dirname, '../../../Truth_Seeker_Model_Dataset.csv'),
    path.join(__dirname, '../../../data/twitter_dataset.csv'),
    path.join(__dirname, '../../../twitter_dataset.csv')
  ];

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
};

/**
 * Normalize a CSV row into the unified Post model format
 */
const normalizeTwitterRow = (row, datasetName) => {
  // Support both Truth Seeker format and generic Twitter dataset format
  const rawText = row.tweet || row.Text || row.text;
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return null;
  }

  const text = rawText.trim();
  const isTruthSeeker = row.statement !== undefined || row.BinaryNumTarget !== undefined || row.target !== undefined;

  let externalId;
  let metadata;
  let username = null;
  let createdAt = null;
  let likes = 0;
  let shares = 0;

  if (isTruthSeeker) {
    externalId = generateDeterministicId(text, row.statement || row.manual_keywords || '');
    metadata = {
      source: 'Truth Seeker Model Dataset 2023',
      datasetType: 'historical_twitter',
      statement: row.statement || null,
      manual_keywords: row.manual_keywords || null,
      target: row.target !== undefined ? String(row.target) : null,
      BinaryNumTarget: row.BinaryNumTarget !== undefined ? String(row.BinaryNumTarget) : null,
      fiveLabelMajorityAnswer: row['5_label_majority_answer'] || null,
      threeLabelMajorityAnswer: row['3_label_majority_answer'] || null,
      tweetLength: row.tweet_length ? Number(row.tweet_length) : text.length,
      statementLength: row.statement_length ? Number(row.statement_length) : null
    };
  } else {
    // twitter_dataset.csv format
    const tweetId = row.Tweet_ID || row.tweet_id || row.id || '';
    externalId = tweetId ? `tw_${tweetId}` : generateDeterministicId(text, tweetId);
    username = row.Username || row.username || null;
    likes = Number(row.Likes) || 0;
    shares = Number(row.Retweets) || 0;

    if (row.Timestamp) {
      const parsedDate = new Date(row.Timestamp);
      if (!isNaN(parsedDate.getTime())) {
        createdAt = parsedDate;
      }
    }

    metadata = {
      source: datasetName || 'twitter_dataset.csv',
      datasetType: 'historical_twitter',
      originalTweetId: tweetId || null,
      rawTimestamp: row.Timestamp || null
    };
  }

  // Deterministic local NLP enrichment
  const analysis = analyzeTweet(text, username, likes, shares);

  return {
    platform: 'twitter',
    externalId,
    authorId: null,
    authorName: username || null,
    username,
    text,
    createdAt: createdAt || new Date(),
    language: 'en',
    metrics: {
      likes,
      comments: 0,
      shares,
      views: 0,
      replies: 0
    },
    hashtags: extractHashtags(text),
    mentions: extractMentions(text),
    mediaType: 'text',
    location: null,
    sentiment: analysis.sentiment,
    sentimentScore: analysis.sentimentScore,
    emotions: analysis.emotions,
    aspects: analysis.aspects,
    topicId: analysis.topicId,
    topicName: analysis.topicName,
    keywords: [],
    botScore: analysis.botScore,
    metadata
  };
};

/**
 * Import Twitter dataset into MongoDB in batches
 */
const importTwitterDataset = async (options = {}) => {
  const filePath = resolveDatasetPath(options.filePath);

  if (!filePath) {
    const error = new Error('Dataset file not found. Expected Truth_Seeker_Model_Dataset.csv or twitter_dataset.csv in data/ or server directory.');
    error.isFileNotFound = true;
    throw error;
  }

  if (mongoose.connection.readyState !== 1) {
    const error = new Error('MongoDB is not connected. MONGO_URI must be configured to import dataset.');
    error.isDbError = true;
    throw error;
  }

  const datasetName = path.basename(filePath);
  const BATCH_SIZE = options.batchSize || 500;

  return new Promise((resolve, reject) => {
    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    let currentBatch = [];
    const seenExternalIdsInBatch = new Set();
    let streamPaused = false;

    const stream = fs.createReadStream(filePath).pipe(
      csv({
        skipLinesWithError: true,
        mapValues: ({ value }) => (typeof value === 'string' ? value.trim() : value)
      })
    );

    const flushBatch = async () => {
      if (currentBatch.length === 0) return;

      const batchToProcess = currentBatch;
      currentBatch = [];
      seenExternalIdsInBatch.clear();

      try {
        const batchIds = batchToProcess.map(doc => doc.externalId);

        // Find existing posts in MongoDB to prevent duplicates
        const existingDocs = await Post.find(
          { platform: 'twitter', externalId: { $in: batchIds } },
          { externalId: 1 }
        ).lean();

        const existingSet = new Set(existingDocs.map(d => d.externalId));
        const newPosts = batchToProcess.filter(doc => !existingSet.has(doc.externalId));

        if (newPosts.length > 0) {
          await Post.insertMany(newPosts, { ordered: false });
        }

        inserted += newPosts.length;
        skipped += batchToProcess.length - newPosts.length;
      } catch (err) {
        console.error('Batch insert error:', err.message);
        failed += batchToProcess.length;
      }
    };

    stream.on('data', async (row) => {
      processed++;

      try {
        const normalizedDoc = normalizeTwitterRow(row, datasetName);

        if (!normalizedDoc) {
          skipped++;
          return;
        }

        // Intra-batch duplicate check
        if (seenExternalIdsInBatch.has(normalizedDoc.externalId)) {
          skipped++;
          return;
        }

        seenExternalIdsInBatch.add(normalizedDoc.externalId);
        currentBatch.push(normalizedDoc);

        if (currentBatch.length >= BATCH_SIZE) {
          stream.pause();
          streamPaused = true;
          await flushBatch();
          if (streamPaused) {
            stream.resume();
            streamPaused = false;
          }
        }
      } catch (err) {
        failed++;
      }
    });

    stream.on('error', (err) => {
      console.error('CSV Stream error:', err);
      reject(err);
    });

    stream.on('end', async () => {
      try {
        await flushBatch();
        resolve({
          dataset: datasetName,
          processed,
          inserted,
          skipped,
          failed
        });
      } catch (err) {
        reject(err);
      }
    });
  });
};

/**
 * Reusable helper to enrich an individual X/Twitter post with the AI service.
 * Used for real-time / newly ingested posts without modifying historical dataset batch processing.
 */
const enrichTwitterPostWithAi = async (postData) => {
  if (!postData || !postData.text) return postData;
  const aiResult = await analyzeSentiment(postData.text);
  return {
    ...postData,
    sentiment: aiResult.sentiment || postData.sentiment,
    topicName: aiResult.topic || postData.topicName,
    topicId: aiResult.topic ? aiResult.topic.toLowerCase() : postData.topicId,
    keywords: Array.isArray(aiResult.keywords) ? aiResult.keywords : (postData.keywords || [])
  };
};

module.exports = {
  importTwitterDataset,
  normalizeTwitterRow,
  enrichTwitterPostWithAi,
  resolveDatasetPath,
  generateDeterministicId,
  extractHashtags,
  extractMentions
};
