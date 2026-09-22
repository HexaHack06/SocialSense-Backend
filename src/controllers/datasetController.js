const { importTwitterDataset } = require('../services/dataset/twitterDatasetImporter');

/**
 * Controller to trigger Twitter dataset import
 * POST /api/datasets/twitter/import
 */
const importTwitterData = async (req, res) => {
  try {
    const { filePath, batchSize } = req.body || {};

    const summary = await importTwitterDataset({
      filePath,
      batchSize: batchSize ? parseInt(batchSize, 10) : undefined
    });

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    if (error.isFileNotFound) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.isDbError) {
      return res.status(503).json({
        success: false,
        message: error.message
      });
    }

    console.error('Error in importTwitterData controller:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to import dataset: ${error.message}`
    });
  }
};

module.exports = {
  importTwitterData
};
