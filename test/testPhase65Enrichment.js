/**
 * Verification test suite for Phase 6.5: Persist AI Enrichment in MongoDB
 * Tests:
 *  A. Python AI is called successfully.
 *  B. Returned sentiment is populated for persistence.
 *  C. Returned topic is populated for persistence.
 *  D. Returned keywords are populated for persistence.
 *  E. AI-service failure does not crash ingestion (safe fallback).
 *  F. Existing Post records remain compatible.
 */

require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const Post = require('../src/models/Post');
const { analyzeSentiment } = require('../src/services/aiService');
const { parseTelegramUpdateToPost } = require('../src/services/telegram/telegramService');
const { enrichTwitterPostWithAi } = require('../src/services/dataset/twitterDatasetImporter');

const runTests = async () => {
  console.log('='.repeat(70));
  console.log('RUNNING PHASE 6.5 AI ENRICHMENT PERSISTENCE TEST SUITE');
  console.log('='.repeat(70));

  // --- Test A, B, C, D: AI Service client returns sentiment, topic, and keywords ---
  console.log('\n[Test 1] Calling AI Service helper for a Technology post...');
  const techText = 'This new AI software is improving computer security';
  const aiResult = await analyzeSentiment(techText);

  assert.ok(aiResult, 'Result should be returned');
  assert.strictEqual(typeof aiResult.sentiment, 'string', 'Sentiment should be a string');
  assert.strictEqual(aiResult.topic, 'Technology', 'Topic should be classified as Technology');
  assert.ok(Array.isArray(aiResult.keywords), 'Keywords should be an array');
  assert.ok(aiResult.keywords.length > 0, 'Keywords should not be empty');
  console.log(`✅ [Test 1 Passed] Sentiment: "${aiResult.sentiment}", Topic: "${aiResult.topic}", Keywords: ${JSON.stringify(aiResult.keywords)}`);

  // --- Test E: AI Service failure fallback ---
  console.log('\n[Test 2] Simulating AI Service unreachable (safe fallback)...');
  const originalUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:9999'; // unreachable port

  const fallbackResult = await analyzeSentiment('Testing unreachable server');
  assert.strictEqual(fallbackResult.sentiment, 'Neutral', 'Fallback sentiment should be Neutral');
  assert.strictEqual(fallbackResult.topic, 'General', 'Fallback topic should be General');
  assert.deepStrictEqual(fallbackResult.keywords, [], 'Fallback keywords should be empty array');
  assert.strictEqual(fallbackResult.success, false, 'Fallback success should be false');
  assert.strictEqual(fallbackResult.fallback, true, 'Fallback flag should be true');
  console.log('✅ [Test 2 Passed] Fallback returned safely without crashing Node backend.');
  process.env.AI_SERVICE_URL = originalUrl;

  // --- Test F: Post schema compatibility and validation ---
  console.log('\n[Test 3] Verifying Post model schema with keywords, sentiment, and topic...');
  const enrichedPostDoc = new Post({
    platform: 'twitter',
    externalId: 'tw_test_12345',
    text: techText,
    sentiment: aiResult.sentiment,
    topicName: aiResult.topic,
    topicId: aiResult.topic.toLowerCase(),
    keywords: aiResult.keywords,
    createdAt: new Date()
  });

  const validationError = enrichedPostDoc.validateSync();
  assert.strictEqual(validationError, undefined, 'Enriched Post document should pass validation');
  assert.strictEqual(enrichedPostDoc.sentiment, aiResult.sentiment);
  assert.strictEqual(enrichedPostDoc.topicName, 'Technology');
  assert.strictEqual(enrichedPostDoc.topicId, 'technology');
  assert.ok(Array.isArray(enrichedPostDoc.keywords) && enrichedPostDoc.keywords.length > 0);
  console.log('✅ [Test 3 Passed] Post document validates with sentiment, topicName, topicId, and keywords.');

  // --- Test G: Backward compatibility with legacy post records ---
  console.log('\n[Test 4] Verifying backward compatibility with legacy Post documents without keywords...');
  const legacyPostDoc = new Post({
    platform: 'telegram',
    externalId: 'tg_legacy_999',
    text: 'Legacy telegram message without prior AI enrichment'
  });
  const legacyValidationError = legacyPostDoc.validateSync();
  assert.strictEqual(legacyValidationError, undefined, 'Legacy Post document should validate without error');
  assert.ok(Array.isArray(legacyPostDoc.keywords), 'Keywords array defaults cleanly');
  console.log('✅ [Test 4 Passed] Legacy Post document remains 100% compatible.');

  // --- Test H: Telegram Ingestion parsing and enrichment flow ---
  console.log('\n[Test 5] Verifying Telegram ingestion enrichment...');
  const mockTelegramUpdate = {
    update_id: 123456,
    message: {
      message_id: 789,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 1001, type: 'channel', title: 'Tech News' },
      from: { id: 2002, first_name: 'Reporter', username: 'tech_reporter' },
      text: 'The company reported higher revenue and profit this quarter.'
    }
  };

  const parsedTgPost = parseTelegramUpdateToPost(mockTelegramUpdate);
  assert.ok(parsedTgPost, 'Parsed Telegram post should exist');
  assert.strictEqual(parsedTgPost.platform, 'telegram');

  // Enrich with AI
  const tgAiResult = await analyzeSentiment(parsedTgPost.text);
  parsedTgPost.sentiment = tgAiResult.sentiment;
  parsedTgPost.topicName = tgAiResult.topic;
  parsedTgPost.topicId = tgAiResult.topic ? tgAiResult.topic.toLowerCase() : 'general';
  parsedTgPost.keywords = tgAiResult.keywords;

  const tgPostDoc = new Post(parsedTgPost);
  const tgValError = tgPostDoc.validateSync();
  assert.strictEqual(tgValError, undefined, 'Enriched Telegram post validates cleanly in Post model');
  assert.strictEqual(tgPostDoc.topicName, 'Business');
  assert.strictEqual(tgPostDoc.topicId, 'business');
  console.log(`✅ [Test 5 Passed] Telegram post enriched: Topic="${tgPostDoc.topicName}", Sentiment="${tgPostDoc.sentiment}", Keywords=${JSON.stringify(tgPostDoc.keywords)}`);

  // --- Test I: Twitter Ingestion helper enrichment flow ---
  console.log('\n[Test 6] Verifying X/Twitter single post AI enrichment helper...');
  const rawTweetPost = {
    platform: 'twitter',
    externalId: 'tw_mock_555',
    text: 'The team won the football match with a late goal',
    sentiment: 'neutral',
    topicName: 'general',
    topicId: 'general',
    keywords: []
  };

  const enrichedTweet = await enrichTwitterPostWithAi(rawTweetPost);
  assert.strictEqual(enrichedTweet.topicName, 'Sports');
  assert.strictEqual(enrichedTweet.topicId, 'sports');
  assert.ok(Array.isArray(enrichedTweet.keywords) && enrichedTweet.keywords.length > 0);
  console.log(`✅ [Test 6 Passed] Twitter post enriched: Topic="${enrichedTweet.topicName}", Keywords=${JSON.stringify(enrichedTweet.keywords)}`);

  console.log('\n' + '='.repeat(70));
  console.log('ALL PHASE 6.5 TESTS PASSED SUCCESSFULLY! (6/6)');
  console.log('='.repeat(70));
};

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
