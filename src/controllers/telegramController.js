const { syncTelegramUpdates } = require('../services/telegram/telegramService');

/**
 * Controller to manually trigger Telegram sync
 * POST /api/telegram/sync
 */
const syncTelegram = async (req, res) => {
  try {
    const summary = await syncTelegramUpdates();

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    // Missing configuration error
    if (error.isConfigError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Database connection error
    if (error.isDbError) {
      return res.status(503).json({
        success: false,
        message: error.message
      });
    }

    // Telegram API or network error
    console.error('Telegram sync error:', error.message);
    return res.status(502).json({
      success: false,
      message: `Failed to sync Telegram messages: ${error.message}`
    });
  }
};

module.exports = {
  syncTelegram
};
