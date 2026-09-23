const mongoose = require('mongoose');
const Post = require('../models/Post');

const getEmptyOverviewData = () => ({
  kpis: {
    totalMentions: 0,
    positivePercentage: 0,
    negativePercentage: 0,
    neutralPercentage: 0,
    wow: {
      totalMentions: 0,
      positivePercentage: 0,
      negativePercentage: 0,
      neutralPercentage: 0
    }
  },
  sentimentTimeline: [],
  topics: [],
  recentPosts: []
});

/**
 * Calculates percentage safely with one decimal precision
 */
const calculatePercentage = (count, total) => {
  if (!total || total === 0) return 0;
  return Number(((count / total) * 100).toFixed(1));
};

/**
 * Calculates Week-over-Week percentage change safely
 */
const calculateWoWChange = (current, previous) => {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

/**
 * Service to aggregate overview metrics
 */
const getOverviewData = async ({ platform, startDate, endDate }) => {
  // If MongoDB is not connected, return empty structure gracefully
  if (mongoose.connection.readyState !== 1) {
    return getEmptyOverviewData();
  }

  const query = {};

  // Platform filtering
  if (platform && platform.toLowerCase() !== 'all') {
    query.platform = platform.toLowerCase();
  }

  // Date filtering
  let currentStart = null;
  let currentEnd = null;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      currentStart = new Date(startDate);
      query.createdAt.$gte = currentStart;
    }
    if (endDate) {
      currentEnd = new Date(endDate);
      if (endDate.length <= 10) {
        currentEnd.setUTCHours(23, 59, 59, 999);
      }
      query.createdAt.$lte = currentEnd;
    }
  }

  // Aggregate current period data
  const [facetResult] = await Post.aggregate([
    { $match: query },
    {
      $facet: {
        kpiData: [
          {
            $group: {
              _id: { $toLower: '$sentiment' },
              count: { $sum: 1 }
            }
          }
        ],
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
        topics: [
          {
            $match: {
              topicId: { $ne: null, $exists: true }
            }
          },
          {
            $group: {
              _id: '$topicId',
              topicName: { $first: { $ifNull: ['$topicName', '$topicId'] } },
              postCount: { $sum: 1 }
            }
          },
          { $sort: { postCount: -1 } },
          { $limit: 10 }
        ],
        recentPosts: [
          { $sort: { createdAt: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 1,
              platform: 1,
              authorName: 1,
              username: 1,
              text: 1,
              createdAt: 1,
              sentiment: 1,
              sentimentScore: 1,
              metrics: 1,
              hashtags: 1,
              mentions: 1,
              mediaType: 1,
              location: 1,
              topicName: 1,
              keywords: 1
            }
          }
        ]
      }
    }
  ]);

  if (!facetResult) {
    return getEmptyOverviewData();
  }

  // Extract KPI counts
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let totalMentions = 0;

  (facetResult.kpiData || []).forEach(item => {
    const sentiment = (item._id || '').toLowerCase();
    const count = item.count || 0;
    totalMentions += count;

    if (sentiment === 'positive') positiveCount += count;
    else if (sentiment === 'negative') negativeCount += count;
    else if (sentiment === 'neutral') neutralCount += count;
  });

  const positivePercentage = calculatePercentage(positiveCount, totalMentions);
  const negativePercentage = calculatePercentage(negativeCount, totalMentions);
  const neutralPercentage = calculatePercentage(neutralCount, totalMentions);

  // Compute prior period for WoW if date filter is active
  let wow = {
    totalMentions: 0,
    positivePercentage: 0,
    negativePercentage: 0,
    neutralPercentage: 0
  };

  if (currentStart && currentEnd) {
    const duration = currentEnd.getTime() - currentStart.getTime();
    const prevStart = new Date(currentStart.getTime() - duration);
    const prevEnd = new Date(currentStart.getTime());

    const prevQuery = {
      ...query,
      createdAt: { $gte: prevStart, $lt: currentStart }
    };

    const prevKpiData = await Post.aggregate([
      { $match: prevQuery },
      {
        $group: {
          _id: { $toLower: '$sentiment' },
          count: { $sum: 1 }
        }
      }
    ]);

    let prevPos = 0;
    let prevNeg = 0;
    let prevNeu = 0;
    let prevTotal = 0;

    prevKpiData.forEach(item => {
      const sentiment = (item._id || '').toLowerCase();
      const count = item.count || 0;
      prevTotal += count;

      if (sentiment === 'positive') prevPos += count;
      else if (sentiment === 'negative') prevNeg += count;
      else if (sentiment === 'neutral') prevNeu += count;
    });

    const prevPosPct = calculatePercentage(prevPos, prevTotal);
    const prevNegPct = calculatePercentage(prevNeg, prevTotal);
    const prevNeuPct = calculatePercentage(prevNeu, prevTotal);

    wow = {
      totalMentions: calculateWoWChange(totalMentions, prevTotal),
      positivePercentage: Number((positivePercentage - prevPosPct).toFixed(1)),
      negativePercentage: Number((negativePercentage - prevNegPct).toFixed(1)),
      neutralPercentage: Number((neutralPercentage - prevNeuPct).toFixed(1))
    };
  }

  // Format sentiment timeline: group by date
  const timelineMap = {};
  (facetResult.sentimentTimeline || []).forEach(item => {
    const date = item._id.date;
    const sentiment = item._id.sentiment;
    const count = item.count;

    if (!timelineMap[date]) {
      timelineMap[date] = {
        date,
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0
      };
    }

    if (sentiment === 'positive') timelineMap[date].positive += count;
    else if (sentiment === 'negative') timelineMap[date].negative += count;
    else if (sentiment === 'neutral') timelineMap[date].neutral += count;

    timelineMap[date].total += count;
  });

  const formattedTimeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

  // Format topics
  const formattedTopics = (facetResult.topics || []).map(topic => ({
    topicId: topic._id,
    topicName: topic.topicName,
    postCount: topic.postCount,
    count: topic.postCount
  }));

  return {
    kpis: {
      totalMentions,
      positivePercentage,
      negativePercentage,
      neutralPercentage,
      wow
    },
    sentimentTimeline: formattedTimeline,
    topics: formattedTopics,
    recentPosts: facetResult.recentPosts || []
  };
};

module.exports = {
  getOverviewData,
  getEmptyOverviewData
};
