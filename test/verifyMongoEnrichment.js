/**
 * Verification script to test and verify MongoDB persistence of AI enrichment.
 * Connects to MongoDB, creates an enriched test post, queries it back, and verifies fields.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('../src/models/Post');
const { analyzeSentiment } = require('../src/services/aiService');

const verify = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set in environment.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB.');

  const testText = 'This new cloud technology product has amazing performance and speed';
  console.log(`\nAnalyzing test text with AI service: "${testText}"`);

  const aiResult = await analyzeSentiment(testText);
  console.log('AI Result:', JSON.stringify(aiResult, null, 2));

  const testExternalId = `test_phase65_${Date.now()}`;

  // Create post in MongoDB with enrichment
  const newPost = await Post.create({
    platform: 'twitter',
    externalId: testExternalId,
    username: 'ai_tester',
    text: testText,
    sentiment: aiResult.sentiment,
    topicName: aiResult.topic,
    topicId: aiResult.topic ? aiResult.topic.toLowerCase() : 'general',
    keywords: aiResult.keywords,
    createdAt: new Date()
  });

  console.log('\n✅ Created test post in MongoDB with _id:', newPost._id);

  // Fetch the post back from MongoDB
  const fetchedDoc = await Post.findById(newPost._id).lean();
  console.log('\nRetrieved Document from MongoDB:');
  console.log(JSON.stringify({
    _id: fetchedDoc._id,
    platform: fetchedDoc.platform,
    externalId: fetchedDoc.externalId,
    text: fetchedDoc.text,
    sentiment: fetchedDoc.sentiment,
    topicName: fetchedDoc.topicName,
    topicId: fetchedDoc.topicId,
    keywords: fetchedDoc.keywords,
    createdAt: fetchedDoc.createdAt
  }, null, 2));

  // Assertions
  if (!fetchedDoc.sentiment) throw new Error('sentiment is missing from MongoDB document!');
  if (!fetchedDoc.topicName) throw new Error('topicName is missing from MongoDB document!');
  if (!Array.isArray(fetchedDoc.keywords) || fetchedDoc.keywords.length === 0) {
    throw new Error('keywords array is missing or empty in MongoDB document!');
  }

  console.log('\n✅ Verification PASSED: MongoDB document contains sentiment, topicName, topicId, and keywords.');

  // Clean up only the specific test document
  await Post.findByIdAndDelete(newPost._id);
  console.log('✅ Test post cleaned up safely without deleting any existing data.');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
};

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
