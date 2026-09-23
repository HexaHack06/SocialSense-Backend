/**
 * AI Service Client
 * Handles communication with the Python FastAPI AI service (Phase 6).
 */

const getAiServiceUrl = () => {
  return process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001';
};

/**
 * Sends text to the Python AI service for sentiment analysis.
 *
 * @param {string} text - The post text to analyze
 * @returns {Promise<{ sentiment: string, success: boolean, fallback?: boolean, raw?: any }>}
 */
const analyzeSentiment = async (text) => {
  const fallbackResult = {
    sentiment: 'Neutral',
    topic: 'General',
    keywords: [],
    success: false,
    fallback: true
  };

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {
      sentiment: 'Neutral',
      topic: 'General',
      keywords: [],
      success: true,
      fallback: false
    };
  }

  const baseUrl = getAiServiceUrl().replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/analyze`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: text.trim() }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.error(`AI service responded with HTTP status ${response.status} from ${targetUrl}`);
      return fallbackResult;
    }

    const json = await response.json();

    if (json && json.success && json.data && json.data.sentiment) {
      return {
        sentiment: json.data.sentiment,
        topic: json.data.topic || 'General',
        keywords: json.data.keywords || [],
        success: true,
        fallback: false,
        raw: json.data
      };
    }

    console.warn('AI service returned unexpected payload structure:', json);
    return fallbackResult;
  } catch (error) {
    // Log AI-service error and return safe fallback without crashing caller
    console.error(`AI service error calling ${targetUrl}:`, error.message);
    return fallbackResult;
  }
};

module.exports = {
  analyzeSentiment,
  getAiServiceUrl
};
