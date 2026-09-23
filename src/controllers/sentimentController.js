const mongoose = require('mongoose');
const { getSentimentData } = require('../services/sentimentService');
const { analyzeSentiment } = require('../services/aiService');
const Post = require('../models/Post');

const VALID_PLATFORMS = ['all', 'twitter', 'instagram', 'telegram'];

/**
 * GET /api/sentiment
 * Query params:
 *   platform   - 'all' | 'twitter' | 'instagram' | 'telegram'  (default: 'all')
 *   startDate  - YYYY-MM-DD or ISO date (optional)
 *   endDate    - YYYY-MM-DD or ISO date (optional)
 */
const getSentiment = async (req, res) => {
  try {
    const { platform = 'all', startDate, endDate } = req.query;

    // Platform validation
    const normalizedPlatform = platform.toString().trim().toLowerCase();
    if (!VALID_PLATFORMS.includes(normalizedPlatform)) {
      return res.status(400).json({
        success: false,
        message: `Invalid platform '${platform}'. Supported: ${VALID_PLATFORMS.join(', ')}`
      });
    }

    // Date validations
    if (startDate && isNaN(Date.parse(startDate))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startDate format. Expected YYYY-MM-DD or valid ISO date.'
      });
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid endDate format. Expected YYYY-MM-DD or valid ISO date.'
      });
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'startDate cannot be after endDate.'
      });
    }

    const data = await getSentimentData({
      platform: normalizedPlatform,
      startDate,
      endDate
    });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error in getSentiment controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching sentiment data'
    });
  }
};

/**
 * POST /api/sentiment/analyze
 * Body:
 *   text      - string (required)
 *   platform  - string (optional: 'twitter', 'telegram', etc.)
 *   postId    - string (optional MongoDB _id to attach/update)
 *   save      - boolean (optional: true to store/update post in DB)
 */
const analyzePostSentiment = async (req, res) => {
  try {
    const { text, platform, postId, save } = req.body || {};

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Text field is required and cannot be empty.'
      });
    }

    const aiResult = await analyzeSentiment(text);

    let savedPost = null;

    // Optional persistence: attach and store/update post in MongoDB
    if (save && mongoose.connection.readyState === 1) {
      const enrichmentData = {
        sentiment: aiResult.sentiment,
        topicName: aiResult.topic || 'General',
        topicId: (aiResult.topic || 'general').toLowerCase(),
        keywords: Array.isArray(aiResult.keywords) ? aiResult.keywords : []
      };

      if (postId) {
        savedPost = await Post.findByIdAndUpdate(
          postId,
          enrichmentData,
          { new: true }
        );
      } else {
        savedPost = await Post.create({
          platform: (platform || 'manual').toLowerCase(),
          text: text.trim(),
          ...enrichmentData,
          createdAt: new Date()
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        text: text.trim(),
        sentiment: aiResult.sentiment,
        topic: aiResult.topic || 'General',
        keywords: Array.isArray(aiResult.keywords) ? aiResult.keywords : [],
        ...(savedPost && { postId: savedPost._id, platform: savedPost.platform }),
        ...(aiResult.fallback && { fallback: true })
      }
    });
  } catch (error) {
    console.error('Error in analyzePostSentiment controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while analyzing sentiment'
    });
  }
};

module.exports = {
  getSentiment,
  analyzePostSentiment
};
