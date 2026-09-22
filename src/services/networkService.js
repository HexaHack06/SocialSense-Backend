const mongoose = require('mongoose');
const Post = require('../models/Post');

const COMMUNITY_COLORS = {
  Technology: '#6366f1',
  Business: '#3b82f6',
  Politics: '#f59e0b',
  Entertainment: '#22d3ee',
  Sports: '#10b981',
  Health: '#ec4899',
  General: '#8b5cf6'
};

const getEmptyNetworkData = () => ({
  influencers: [],
  networkNodes: [],
  networkEdges: [],
  communities: Object.keys(COMMUNITY_COLORS),
  commColors: COMMUNITY_COLORS
});

/**
 * Service to generate network graph and influencer intelligence from MongoDB.
 */
const getNetworkData = async ({ platform, startDate, endDate }) => {
  if (mongoose.connection.readyState !== 1) {
    return getEmptyNetworkData();
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

  // Aggregate top active authors by engagement
  const authorsAgg = await Post.aggregate([
    { $match: { ...query, username: { $exists: true, $ne: null, $nin: ['', 'null'] } } },
    {
      $group: {
        _id: '$username',
        authorName: { $first: '$authorName' },
        postCount: { $sum: 1 },
        totalLikes: { $sum: '$metrics.likes' },
        totalShares: { $sum: '$metrics.shares' },
        topics: { $push: '$topicName' },
        avgSentiment: { $avg: '$sentimentScore' },
        avgBotScore: { $avg: '$botScore' }
      }
    },
    {
      $project: {
        _id: 1,
        authorName: 1,
        postCount: 1,
        totalLikes: 1,
        totalShares: 1,
        totalEngagement: { $add: ['$totalLikes', '$totalShares'] },
        topics: 1,
        avgSentiment: 1,
        avgBotScore: 1
      }
    },
    { $sort: { totalEngagement: -1 } },
    { $limit: 12 }
  ]);

  if (!authorsAgg || authorsAgg.length === 0) {
    return getEmptyNetworkData();
  }

  const maxEngagement = authorsAgg[0].totalEngagement || 1;

  // Format influencers
  const influencers = authorsAgg.map((author, index) => {
    const id = index + 1;
    const rawUsername = author._id;
    const username = `@${rawUsername}`;

    // Determine primary community (most frequent topic)
    const topicCounts = {};
    (author.topics || []).forEach(t => {
      if (t) topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
    const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
    const community = sortedTopics[0] ? sortedTopics[0][0] : 'General';

    // Normalized influence score (55 to 96)
    const score = Number((55 + (author.totalEngagement / maxEngagement) * 41).toFixed(1));

    // PageRank estimate
    const pagerank = Number((0.015 + (score / 100) * 0.030).toFixed(3));

    // Connections (scaled from post count & shares)
    const connections = 500 + author.postCount * 120 + (author.totalShares % 500);

    // Formatted follower reach
    const estFollowersK = Math.max(12, Math.round((author.totalLikes * 45 + author.totalShares * 30) / 1000));
    const followers = `${estFollowersK}K`;

    // Engagement rate
    const avgLikesPerPost = author.totalLikes / (author.postCount || 1);
    const engagement = `${Math.min(12.5, Math.max(3.2, Number((avgLikesPerPost / 8).toFixed(1))))}%`;

    // Formatted display name
    let displayName = author.authorName || rawUsername;
    if (displayName.toLowerCase() === rawUsername.toLowerCase()) {
      // capitalize nicely e.g. pjohnson -> P. Johnson
      displayName = rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1);
    }

    const sentimentTone = author.avgSentiment > 0.1 ? 'constructive' : author.avgSentiment < -0.1 ? 'critical' : 'balanced';
    const bio = `Key ${community} commentator & analyst. Frequent contributor with ${sentimentTone} discussions across social streams.`;

    return {
      id,
      name: displayName,
      username,
      community,
      score,
      pagerank,
      connections,
      followers,
      engagement,
      bio
    };
  });

  // Calculate layout coordinates for NetworkCanvas (canvas size: 720 x 440)
  // Position nodes in an elliptical network layout around center (360, 210)
  const networkNodes = influencers.map((inf, i) => {
    const total = influencers.length;
    // Alternate inner and outer rings for high visual clarity
    const isInner = i % 2 === 0;
    const rx = isInner ? 160 : 250;
    const ry = isInner ? 95 : 150;
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;

    const x = Math.round(360 + rx * Math.cos(angle));
    const y = Math.round(210 + ry * Math.sin(angle));

    // Size based on influence score: 14 to 28
    const size = Math.round(14 + ((inf.score - 55) / 41) * 14);
    const color = COMMUNITY_COLORS[inf.community] || '#6366f1';

    return {
      id: inf.id,
      label: inf.username,
      community: inf.community,
      size,
      x,
      y,
      color
    };
  });

  // Generate sensible network edges based on community similarity and influence proximity
  const networkEdges = [];
  for (let i = 0; i < influencers.length; i++) {
    for (let j = i + 1; j < influencers.length; j++) {
      const a = influencers[i];
      const b = influencers[j];

      // Connect if same community
      if (a.community === b.community) {
        networkEdges.push({ source: a.id, target: b.id, weight: 3 });
      } else if (i === 0 || (i <= 2 && j <= 5)) {
        // Connect top hub nodes across communities
        networkEdges.push({ source: a.id, target: b.id, weight: 2 });
      } else if (Math.abs(a.id - b.id) === 1 && networkEdges.length < 18) {
        // Sequential link to guarantee connected graph
        networkEdges.push({ source: a.id, target: b.id, weight: 1 });
      }
    }
  }

  const communities = Array.from(new Set(influencers.map(inf => inf.community)));

  return {
    influencers,
    networkNodes,
    networkEdges,
    communities: communities.length > 0 ? communities : Object.keys(COMMUNITY_COLORS),
    commColors: COMMUNITY_COLORS
  };
};

module.exports = {
  getNetworkData,
  getEmptyNetworkData
};
