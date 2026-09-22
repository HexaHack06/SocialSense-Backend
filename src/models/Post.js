const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      trim: true,
      index: true
    },
    externalId: {
      type: String,
      trim: true,
      index: true
    },
    authorId: {
      type: String,
      trim: true
    },
    authorName: {
      type: String,
      trim: true
    },
    username: {
      type: String,
      trim: true
    },
    text: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    language: {
      type: String,
      trim: true
    },
    metrics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      replies: { type: Number, default: 0 }
    },
    hashtags: [{
      type: String,
      trim: true
    }],
    mentions: [{
      type: String,
      trim: true
    }],
    mediaType: {
      type: String,
      trim: true
    },
    location: {
      type: String,
      trim: true
    },
    sentiment: {
      type: String,
      trim: true,
      index: true
    },
    sentimentScore: {
      type: Number
    },
    emotions: [{
      type: mongoose.Schema.Types.Mixed
    }],
    aspects: [{
      type: mongoose.Schema.Types.Mixed
    }],
    topicId: {
      type: String,
      trim: true,
      index: true
    },
    topicName: {
      type: String,
      trim: true
    },
    botScore: {
      type: Number
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Compound index for platform + externalId lookups
postSchema.index({ platform: 1, externalId: 1 });

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
