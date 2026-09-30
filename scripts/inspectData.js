const mongoose = require('mongoose');
require('dotenv').config();

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  const coll = mongoose.connection.db.collection('posts');
  
  const sample = await coll.findOne();
  console.log('Sample document:\n', JSON.stringify(sample, null, 2));

  const total = await coll.countDocuments();
  console.log('Total posts:', total);

  const distinctSentiments = await coll.distinct('sentiment');
  console.log('Distinct sentiments:', distinctSentiments);

  const sampleDates = await coll.find({}, { projection: { createdAt: 1 } }).sort({ createdAt: 1 }).limit(3).toArray();
  const sampleMaxDates = await coll.find({}, { projection: { createdAt: 1 } }).sort({ createdAt: -1 }).limit(3).toArray();
  console.log('Min dates:', sampleDates.map(d => d.createdAt));
  console.log('Max dates:', sampleMaxDates.map(d => d.createdAt));

  const withSentiment = await coll.countDocuments({ sentiment: { $ne: null } });
  console.log('Posts with sentiment:', withSentiment);

  const withBotScore = await coll.countDocuments({ botScore: { $ne: null } });
  console.log('Posts with botScore:', withBotScore);

  const withEmotions = await coll.countDocuments({ 'emotions.0': { $exists: true } });
  console.log('Posts with emotions:', withEmotions);

  const withAspects = await coll.countDocuments({ 'aspects.0': { $exists: true } });
  console.log('Posts with aspects:', withAspects);

  const withTopicName = await coll.countDocuments({ topicName: { $ne: null } });
  console.log('Posts with topicName:', withTopicName);

  const distinctTopics = await coll.distinct('topicName');
  console.log('Distinct topic names:', distinctTopics.slice(0, 10));

  await mongoose.disconnect();
}

inspect().catch(err => {
  console.error('Inspection error:', err);
  process.exit(1);
});
