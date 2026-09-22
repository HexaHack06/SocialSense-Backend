const mongoose = require('mongoose');
const Post = require('../models/Post');

const SENTIMENT_LABELS = ['positive', 'negative', 'neutral'];

const getEmptySentimentData = () => ({
  kpis: {
    totalMentions: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    positivePercentage: 0,
    negativePercentage: 0,
    neutralPercentage: 0,
    avgSentimentScore: 0
  },
  sentimentTimeline: [],
  emotionBreakdown: [],
  aspectBreakdown: [],
  recentPosts: []
});

const calculatePercentage = (count, total) => {
  if (!total) return 0;
  return Number(((count / total) * 100).toFixed(1));
};

/**
 * Aggregate full sentiment analytics from the Post collection.
 * Mirrors the architecture of overviewService.js.
 */
const getSentimentData = async ({ platform, startDate, endDate }) => {
  if (mongoose.connection.readyState !== 1) {
    return getEmptySentimentData();
  }

  const query = {};

  // Platform filter
  if (platform && platform.toLowerCase() !== 'all') {
    query.platform = platform.toLowerCase();
  }

  // Date filter
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

  // Single aggregation pipeline with $facet for all sections
  const [facetResult] = await Post.aggregate([
    { $match: query },
    {
      $facet: {
        // 1. KPIs — counts by sentiment label + average score
        kpiData: [
          {
            $group: {
              _id: { $toLower: '$sentiment' },
              count: { $sum: 1 }
            }
          }
        ],
        avgScoreData: [
          {
            $match: { sentimentScore: { $ne: null, $exists: true } }
          },
          {
            $group: {
              _id: null,
              avg: { $avg: '$sentimentScore' }
            }
          }
        ],

        // 2. Sentiment timeline — percentage breakdown per day
        sentimentTimeline: [
          {
            $group: {
              _id: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                sentiment: { $toLower: '$sentiment' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.date': 1 } }
        ],

        // 3. Emotion breakdown — aggregate emotions array across all posts
        emotionData: [
          { $match: { 'emotions.0': { $exists: true } } },
          { $unwind: '$emotions' },
          {
            $group: {
              _id: '$emotions.name',
              totalScore: { $sum: '$emotions.score' },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 1,
              avgScore: { $divide: ['$totalScore', '$count'] },
              count: 1
            }
          },
          { $sort: { count: -1 } }
        ],

        // 4. Aspect breakdown — aggregate aspects array across all posts
        aspectData: [
          { $match: { 'aspects.0': { $exists: true } } },
          { $unwind: '$aspects' },
          {
            $group: {
              _id: '$aspects.name',
              positiveCount: {
                $sum: { $cond: [{ $eq: ['$aspects.sentiment', 'positive'] }, 1, 0] }
              },
              negativeCount: {
                $sum: { $cond: [{ $eq: ['$aspects.sentiment', 'negative'] }, 1, 0] }
              },
              neutralCount: {
                $sum: { $cond: [{ $eq: ['$aspects.sentiment', 'neutral'] }, 1, 0] }
              },
              totalCount: { $sum: 1 },
              avgScore: { $avg: '$aspects.score' }
            }
          },
          { $sort: { totalCount: -1 } }
        ],

        // 5. Recent posts with full sentiment context
        recentPosts: [
          { $sort: { createdAt: -1 } },
          { $limit: 50 },
          {
            $project: {
              _id: 1,
              platform: 1,
              username: 1,
              authorName: 1,
              text: 1,
              createdAt: 1,
              sentiment: 1,
              sentimentScore: 1,
              emotions: 1,
              aspects: 1,
              metrics: 1
            }
          }
        ]
      }
    }
  ]);

  if (!facetResult) {
    return getEmptySentimentData();
  }

  // --- Process KPIs ---
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let totalMentions = 0;

  (facetResult.kpiData || []).forEach(item => {
    const label = (item._id || '').toLowerCase();
    const count = item.count || 0;
    totalMentions += count;
    if (label === 'positive') positiveCount += count;
    else if (label === 'negative') negativeCount += count;
    else if (label === 'neutral') neutralCount += count;
  });

  const avgSentimentScore =
    facetResult.avgScoreData && facetResult.avgScoreData[0]
      ? Number(facetResult.avgScoreData[0].avg.toFixed(3))
      : 0;

  // --- Process sentiment timeline: convert counts to per-day percentages ---
  const timelineMap = {};
  (facetResult.sentimentTimeline || []).forEach(item => {
    const date = item._id.date;
    const sentiment = item._id.sentiment;
    const count = item.count;

    if (!timelineMap[date]) {
      timelineMap[date] = { date, positive: 0, negative: 0, neutral: 0, total: 0 };
    }

    if (sentiment === 'positive') timelineMap[date].positive += count;
    else if (sentiment === 'negative') timelineMap[date].negative += count;
    else if (sentiment === 'neutral') timelineMap[date].neutral += count;

    timelineMap[date].total += count;
  });

  const sentimentTimeline = Object.values(timelineMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => ({
      date: day.date,
      positive: day.total > 0 ? Number(((day.positive / day.total) * 100).toFixed(1)) : 0,
      negative: day.total > 0 ? Number(((day.negative / day.total) * 100).toFixed(1)) : 0,
      neutral: day.total > 0 ? Number(((day.neutral / day.total) * 100).toFixed(1)) : 0,
      total: day.total
    }));

  // --- Process emotion breakdown ---
  const emotionBreakdown = (facetResult.emotionData || []).map(item => ({
    emotion: item._id,
    value: Number((item.avgScore * 100).toFixed(1)), // Convert 0-1 score to 0-100 for UI
    count: item.count,
    fullMark: 100
  }));

  // --- Process aspect breakdown ---
  const aspectBreakdown = (facetResult.aspectData || []).map(item => {
    const total = item.totalCount || 1;
    return {
      name: item._id,
      totalCount: item.totalCount,
      positiveCount: item.positiveCount,
      negativeCount: item.negativeCount,
      neutralCount: item.neutralCount,
      positivePercentage: calculatePercentage(item.positiveCount, total),
      negativePercentage: calculatePercentage(item.negativeCount, total),
      neutralPercentage: calculatePercentage(item.neutralCount, total),
      avgScore: Number((item.avgScore || 0).toFixed(2))
    };
  });

  // --- Format recent posts for the UI table ---
  const recentPosts = (facetResult.recentPosts || []).map(p => {
    // Pick the top emotion (highest score)
    const topEmotion =
      Array.isArray(p.emotions) && p.emotions.length > 0
        ? p.emotions.reduce((a, b) => ((a.score || 0) > (b.score || 0) ? a : b))
        : null;

    // Convert sentimentScore (-1 to 1) to confidence (0 to 100)
    const confidence =
      p.sentimentScore !== null && p.sentimentScore !== undefined
        ? Math.round(Math.abs(p.sentimentScore) * 100)
        : null;

    return {
      id: p._id,
      post: p.text,
      sentiment: p.sentiment
        ? p.sentiment.charAt(0).toUpperCase() + p.sentiment.slice(1)
        : 'Neutral',
      emotion: topEmotion ? topEmotion.name.charAt(0).toUpperCase() + topEmotion.name.slice(1) : '—',
      confidence: confidence !== null ? confidence : 0,
      platform: p.platform
        ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1)
        : 'Unknown',
      time: p.createdAt
        ? new Date(p.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        : '',
      sentimentScore: p.sentimentScore,
      username: p.username || p.authorName || '—',
      metrics: p.metrics || {}
    };
  });

  return {
    kpis: {
      totalMentions,
      positiveCount,
      negativeCount,
      neutralCount,
      positivePercentage: calculatePercentage(positiveCount, totalMentions),
      negativePercentage: calculatePercentage(negativeCount, totalMentions),
      neutralPercentage: calculatePercentage(neutralCount, totalMentions),
      avgSentimentScore
    },
    sentimentTimeline,
    emotionBreakdown,
    aspectBreakdown,
    recentPosts
  };
};

module.exports = {
  getSentimentData,
  getEmptySentimentData
};
