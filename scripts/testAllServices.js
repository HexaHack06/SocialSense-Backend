const mongoose = require('mongoose');
require('dotenv').config();

const { getOverviewData } = require('../src/services/overviewService');
const { getSentimentData } = require('../src/services/sentimentService');
const { getTrendsData } = require('../src/services/trendsService');
const { getAudienceData } = require('../src/services/audienceService');
const { getNetworkData } = require('../src/services/networkService');
const { getAlertsData } = require('../src/services/alertsService');

async function testServices() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  console.log('\n--- 1. OVERVIEW SERVICE ---');
  const overview = await getOverviewData({});
  console.log('Overview KPIs:', overview.kpis);
  console.log('Overview Timeline length:', overview.sentimentTimeline.length);
  console.log('Overview Topics count:', overview.topics.length);
  console.log('Overview Recent posts:', overview.recentPosts.length);

  console.log('\n--- 2. SENTIMENT SERVICE ---');
  const sentiment = await getSentimentData({});
  console.log('Sentiment KPIs:', sentiment.kpis);
  console.log('Sentiment Timeline length:', sentiment.sentimentTimeline.length);
  console.log('Emotions length:', sentiment.emotionBreakdown.length);
  console.log('Aspects length:', sentiment.aspectBreakdown.length);
  console.log('Recent posts length:', sentiment.recentPosts.length);

  console.log('\n--- 3. TRENDS SERVICE ---');
  const trends = await getTrendsData({});
  console.log('Trends table rows:', trends.trendsTableData.length);
  console.log('Trending topics:', trends.trendingTopics.length);
  console.log('Trend activity:', trends.trendActivity.length);
  console.log('Trend forecast:', trends.trendForecast.length);

  console.log('\n--- 4. AUDIENCE SERVICE ---');
  const audience = await getAudienceData({});
  console.log('Audience Age groups:', audience.ageGroups.length);
  console.log('Audience Gender:', audience.gender);
  console.log('Audience Locations:', audience.locations.length);
  console.log('Audience Interests:', audience.interests.length);
  console.log('Audience Platforms:', audience.platforms.length);
  console.log('Audience Engagement:', audience.engagementLevels.length);

  console.log('\n--- 5. NETWORK SERVICE ---');
  const network = await getNetworkData({});
  console.log('Influencers count:', network.influencers.length);
  console.log('Nodes count:', network.networkNodes.length);
  console.log('Edges count:', network.networkEdges.length);

  console.log('\n--- 6. ALERTS SERVICE ---');
  const alerts = await getAlertsData({});
  console.log('Alerts count:', alerts.length);
  if (alerts.length > 0) {
    console.log('Sample alert:', JSON.stringify(alerts[0], null, 2));
  }

  await mongoose.disconnect();
}

testServices().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
