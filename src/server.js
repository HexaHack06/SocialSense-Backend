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
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

// Connect to MongoDB if configured
connectDatabase();

// Security & utility middleware
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:(517[0-9]|3000)$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
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
