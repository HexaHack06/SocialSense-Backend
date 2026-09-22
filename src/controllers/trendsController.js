const { getTrendsData } = require('../services/trendsService');

const VALID_PLATFORMS = ['all', 'twitter', 'instagram', 'telegram'];

const getTrends = async (req, res) => {
  try {
    const { platform = 'all', startDate, endDate } = req.query;

    const normalizedPlatform = platform.toString().trim().toLowerCase();
    if (!VALID_PLATFORMS.includes(normalizedPlatform)) {
      return res.status(400).json({
        success: false,
        message: `Invalid platform '${platform}'. Supported platforms: ${VALID_PLATFORMS.join(', ')}`
      });
    }

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

    const data = await getTrendsData({
      platform: normalizedPlatform,
      startDate,
      endDate
    });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error in getTrends controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching trends data'
    });
  }
};

module.exports = {
  getTrends
};
