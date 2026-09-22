const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDatabase = require('./config/database');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Helper to normalize origins (strips trailing slashes, subpaths, and extracts protocol + host)
const normalizeOrigin = (str) => {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch (e) {
    return trimmed;
  }
};

// Default allowed origins: production GitHub Pages and local development ports
const defaultAllowedOrigins = [
  'https://hexahack06.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000'
];

// Safely parse comma-separated origins from FRONTEND_URL
const envOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',')
      .map(normalizeOrigin)
      .filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envOrigins]));

// Connect to MongoDB if configured
connectDatabase();

// Security & utility middleware
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server, health checks)
    if (!origin) {
      return callback(null, true);
    }

    const normalized = normalizeOrigin(origin);

    if (
      allowedOrigins.includes(normalized) ||
      /^http:\/\/(localhost|127\.0\.0\.1):(517[0-9]|3000)$/.test(origin)
    ) {
      return callback(null, true);
    }

    console.warn(`Blocked by CORS: origin='${origin}', normalized='${normalized}'`);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());

const overviewRoutes = require('./routes/overviewRoutes');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SocialSense backend is running'
  });
});

// Overview routes
app.use('/api/overview', overviewRoutes);

const sentimentRoutes = require('./routes/sentimentRoutes');

// Sentiment routes
app.use('/api/sentiment', sentimentRoutes);

const telegramRoutes = require('./routes/telegramRoutes');

// Telegram routes
app.use('/api/telegram', telegramRoutes);

const datasetRoutes = require('./routes/datasetRoutes');

// Dataset import routes
app.use('/api/datasets', datasetRoutes);

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SocialSense backend running on port ${PORT}`);
});

module.exports = { app, server };
