const mongoose = require('mongoose');

const connectDatabase = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI || mongoURI.trim() === '') {
    console.log('ℹ️ MongoDB is not configured (MONGO_URI is empty). Server is running without database connection.');
    return;
  }

  try {
    const conn = await mongoose.connect(mongoURI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}. Server continues running without database.`);
  }
};

module.exports = connectDatabase;
