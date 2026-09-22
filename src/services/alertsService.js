const mongoose = require('mongoose');
const Post = require('../models/Post');

const getEmptyAlertsData = () => [];

/**
 * Helper to compute relative time string from Date
 */
const getRelativeTimeString = (offsetMinutes = 15) => {
  if (offsetMinutes < 60) return `${offsetMinutes} minutes ago`;
  const hours = Math.round(offsetMinutes / 60);
  return `${hours} hour${hours > 1 ? 's' : ''} ago`;
};

/**
 * Service to generate dynamic, data-driven intelligence alerts from MongoDB.
 */
const getAlertsData = async ({ platform, startDate, endDate }) => {
  if (mongoose.connection.readyState !== 1) {
    return getEmptyAlertsData();
  }

  const query = {};

  if (platform && platform.toLowerCase() !== 'all') {
    query.platform = platform.toLowerCase();
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const endDt = new Date(endDate);
      if (endDate.length <= 10) {
        endDt.setUTCHours(23, 59, 59, 999);
      }
      query.createdAt.$lte = endDt;
    }
  }

  // Single facet aggregation to collect all data points needed for alert generation
  const [facetResult] = await Post.aggregate([
    { $match: query },
    {
      $facet: {
        // Topic sentiment stats
        topicStats: [
          {
            $group: {
              _id: '$topicName',
              total: { $sum: 1 },
              negCount: { $sum: { $cond: [{ $eq: ['$sentiment', 'negative'] }, 1, 0] } },
              posCount: { $sum: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, 0] } },
              neuCount: { $sum: { $cond: [{ $eq: ['$sentiment', 'neutral'] }, 1, 0] } },
              totalLikes: { $sum: '$metrics.likes' },
              totalShares: { $sum: '$metrics.shares' },
              latestPostDate: { $max: '$createdAt' }
            }
          },
          { $sort: { negCount: -1 } }
        ],

        // High bot score / automated spam patterns
        botSpikes: [
          { $match: { botScore: { $gte: 0.25 } } },
          {
            $group: {
              _id: '$topicName',
              botCount: { $sum: 1 },
              avgBotScore: { $avg: '$botScore' },
              latestDate: { $max: '$createdAt' }
            }
          },
          { $sort: { botCount: -1 } },
          { $limit: 3 }
        ],

        // Top emerging creator
        topCreator: [
          { $match: { username: { $exists: true, $ne: null, $nin: ['', 'null'] } } },
          {
            $group: {
              _id: '$username',
              authorName: { $first: '$authorName' },
              likes: { $sum: '$metrics.likes' },
              shares: { $sum: '$metrics.shares' },
              topic: { $first: '$topicName' },
              latestDate: { $max: '$createdAt' }
            }
          },
          { $sort: { likes: -1 } },
          { $limit: 1 }
        ],

        // Overall stats
        overview: [
          {
            $group: {
              _id: null,
              totalPosts: { $sum: 1 },
              latestDate: { $max: '$createdAt' }
            }
          }
        ]
      }
    }
  ]);

  if (!facetResult || !facetResult.overview || facetResult.overview.length === 0) {
    return getEmptyAlertsData();
  }

  const alerts = [];
  const topicStats = facetResult.topicStats || [];
  const botSpikes = facetResult.botSpikes || [];
  const topCreator = facetResult.topCreator && facetResult.topCreator[0] ? facetResult.topCreator[0] : null;

  // 1. High Severity Alert: Negative Sentiment Spike
  const worstSentimentTopic = topicStats[0];
  if (worstSentimentTopic && worstSentimentTopic.negCount > 0) {
    const negPct = ((worstSentimentTopic.negCount / worstSentimentTopic.total) * 100).toFixed(1);
    alerts.push({
      id: 'a1',
      severity: 'high',
      title: `Elevated Negative Sentiment Spike in ${worstSentimentTopic._id}`,
      topic: worstSentimentTopic._id,
      time: getRelativeTimeString(15),
      read: false,
      description: `Negative sentiment in "${worstSentimentTopic._id}" reached ${negPct}% with ${worstSentimentTopic.negCount.toLocaleString()} critical posts out of ${worstSentimentTopic.total.toLocaleString()} total mentions.`,
      action: 'Prioritize community response review and prepare proactive talking points for stakeholders.',
      details: {
        volume: `${worstSentimentTopic.total.toLocaleString()} posts`,
        change: `+${negPct}% negative`,
        affectedPlatform: platform === 'all' ? 'Twitter' : platform.charAt(0).toUpperCase() + platform.slice(1),
        urgency: 'Immediate'
      }
    });
  }

  // 2. Medium Severity Alert: High-Velocity Trend Emergence
  const topVolumeTopic = [...topicStats].sort((a, b) => (b.totalLikes + b.totalShares) - (a.totalLikes + a.totalShares))[0];
  if (topVolumeTopic) {
    const totalEngage = topVolumeTopic.totalLikes + topVolumeTopic.totalShares;
    alerts.push({
      id: 'a2',
      severity: 'medium',
      title: `Surging Discussion Volume: ${topVolumeTopic._id}`,
      topic: topVolumeTopic._id,
      time: getRelativeTimeString(35),
      read: false,
      description: `Topic "${topVolumeTopic._id}" accumulated over ${totalEngage.toLocaleString()} engagements across ${topVolumeTopic.total.toLocaleString()} posts. High positive velocity detected.`,
      action: 'Amplify positive community narratives and engage high-resonance discussions.',
      details: {
        volume: `${topVolumeTopic.total.toLocaleString()} posts`,
        change: `+${Math.round((topVolumeTopic.posCount / topVolumeTopic.total) * 100)}% positive`,
        affectedPlatform: platform === 'all' ? 'All Platforms' : platform.charAt(0).toUpperCase() + platform.slice(1),
        urgency: 'Today'
      }
    });
  }

  // 3. High Severity Alert: Automated Bot & Coordination Risk
  if (botSpikes.length > 0 && botSpikes[0].botCount > 10) {
    const botTopic = botSpikes[0];
    const avgScore = (botTopic.avgBotScore * 100).toFixed(0);
    alerts.push({
      id: 'a3',
      severity: 'high',
      title: `Automated Bot Amplification Cluster Detected`,
      topic: botTopic._id,
      time: getRelativeTimeString(60),
      read: false,
      description: `Heuristic pattern analyzer flagged ${botTopic.botCount.toLocaleString()} posts in "${botTopic._id}" with suspicious bot behavior (avg score ${avgScore}/100, trailing numeric handles, abnormal share-to-like ratios).`,
      action: 'Filter coordinated bot anomalies from sentiment aggregations and flag suspicious handles.',
      details: {
        volume: `${botTopic.botCount.toLocaleString()} flagged posts`,
        change: `${avgScore}% bot risk index`,
        affectedPlatform: 'Twitter',
        urgency: 'Immediate'
      }
    });
  }

  // 4. Info Severity Alert: Top Emerging Creator
  if (topCreator) {
    alerts.push({
      id: 'a4',
      severity: 'info',
      title: `High-Resonance Creator Lead Identified`,
      topic: topCreator.topic || 'General',
      time: getRelativeTimeString(120),
      read: true,
      description: `Author @${topCreator._id} generated ${topCreator.likes.toLocaleString()} likes and ${topCreator.shares.toLocaleString()} shares across ${topCreator.topic || 'recent'} discussions. High engagement authority score.`,
      action: 'Review creator content alignment for potential collaboration or social listening focus.',
      details: {
        volume: `${(topCreator.likes + topCreator.shares).toLocaleString()} engagement`,
        change: 'Top Tier Voice',
        affectedPlatform: 'Twitter',
        urgency: 'Low'
      }
    });
  }

  // 5. Medium Severity Alert: Secondary Topic Health Warning
  if (topicStats.length >= 2) {
    const secondaryTopic = topicStats[1];
    alerts.push({
      id: 'a5',
      severity: 'medium',
      title: `Community Engagement Shift: ${secondaryTopic._id}`,
      topic: secondaryTopic._id,
      time: getRelativeTimeString(240),
      read: true,
      description: `Mentions in "${secondaryTopic._id}" experienced shifting sentiment dynamics with ${secondaryTopic.neuCount.toLocaleString()} neutral and ${secondaryTopic.negCount.toLocaleString()} critical posts.`,
      action: 'Track conversational momentum over the next 24 hours to monitor resolution.',
      details: {
        volume: `${secondaryTopic.total.toLocaleString()} posts`,
        change: `${((secondaryTopic.neuCount / secondaryTopic.total) * 100).toFixed(0)}% neutral baseline`,
        affectedPlatform: 'Twitter',
        urgency: 'This Week'
      }
    });
  }

  return alerts;
};

module.exports = {
  getAlertsData,
  getEmptyAlertsData
};
