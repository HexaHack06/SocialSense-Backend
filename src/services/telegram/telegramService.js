const mongoose = require('mongoose');
const Post = require('../../models/Post');

/**
 * Extract hashtags from entities or text
 */
const extractHashtags = (text, entities = []) => {
  const hashtags = new Set();

  entities.forEach(ent => {
    if (ent.type === 'hashtag') {
      const tag = text.substring(ent.offset, ent.offset + ent.length);
      hashtags.add(tag);
    }
  });

  if (hashtags.size === 0 && text) {
    const matched = text.match(/#[\w\u0590-\u05ff]+/g);
    if (matched) {
      matched.forEach(t => hashtags.add(t));
    }
  }

  return Array.from(hashtags);
};

/**
 * Extract mentions from entities or text
 */
const extractMentions = (text, entities = []) => {
  const mentions = new Set();

  entities.forEach(ent => {
    if (ent.type === 'mention') {
      const mention = text.substring(ent.offset, ent.offset + ent.length);
      mentions.add(mention);
    }
  });

  if (mentions.size === 0 && text) {
    const matched = text.match(/@\w+/g);
    if (matched) {
      matched.forEach(m => mentions.add(m));
    }
  }

  return Array.from(mentions);
};

/**
 * Detect media type from Telegram message
 */
const detectMediaType = (msg) => {
  if (msg.photo && msg.photo.length > 0) return 'photo';
  if (msg.video) return 'video';
  if (msg.audio) return 'audio';
  if (msg.voice) return 'voice';
  if (msg.video_note) return 'video_note';
  if (msg.document) return 'document';
  if (msg.animation) return 'animation';
  return 'text';
};

/**
 * Convert a Telegram update to unified Post model format
 */
const parseTelegramUpdateToPost = (update) => {
  const msg = update.message || update.channel_post || update.edited_message || update.edited_channel_post;

  if (!msg) return null;

  const text = msg.text || msg.caption;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return null;
  }

  const entities = msg.entities || msg.caption_entities || [];
  const from = msg.from || msg.sender_chat || {};
  const chat = msg.chat || {};

  const authorName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.title || from.first_name || null;

  return {
    platform: 'telegram',
    externalId: String(msg.message_id),
    authorId: from.id ? String(from.id) : null,
    authorName,
    username: from.username || null,
    text: text.trim(),
    createdAt: msg.date ? new Date(msg.date * 1000) : new Date(),
    language: null,
    metrics: {
      likes: 0,
      comments: 0,
      shares: 0,
      views: msg.views || 0,
      replies: 0
    },
    hashtags: extractHashtags(text, entities),
    mentions: extractMentions(text, entities),
    mediaType: detectMediaType(msg),
    location: msg.location ? `${msg.location.latitude},${msg.location.longitude}` : null,
    sentiment: null,
    sentimentScore: null,
    emotions: [],
    aspects: [],
    topicId: null,
    topicName: null,
    botScore: null,
    metadata: {
      updateId: update.update_id,
      chatId: chat.id || null,
      chatType: chat.type || null,
      chatTitle: chat.title || null,
      isForwarded: !!(msg.forward_date || msg.forward_from),
      messageType: update.channel_post ? 'channel_post' : 'message'
    }
  };
};

/**
 * Fetch updates from official Telegram Bot API
 */
const fetchTelegramUpdates = async (token, options = {}) => {
  const url = `https://api.telegram.org/bot${token}/getUpdates`;

  try {
    const params = new URLSearchParams();
    if (options.offset) params.append('offset', options.offset);
    if (options.limit) params.append('limit', options.limit);
    if (options.timeout) params.append('timeout', options.timeout);

    const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;
    const response = await fetch(fullUrl);

    const json = await response.json();

    if (!response.ok || !json.ok) {
      const errorMsg = json.description || `HTTP status ${response.status}`;
      throw new Error(`Telegram API error: ${errorMsg}`);
    }

    return json.result || [];
  } catch (error) {
    // Sanitize any token from error message
    const sanitizedMsg = error.message.replace(token, '[REDACTED_TOKEN]');
    throw new Error(sanitizedMsg);
  }
};

/**
 * Perform Telegram synchronization
 */
const syncTelegramUpdates = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token.trim() === '') {
    const err = new Error('TELEGRAM_BOT_TOKEN is not configured in environment variables');
    err.isConfigError = true;
    throw err;
  }

  if (mongoose.connection.readyState !== 1) {
    const err = new Error('MongoDB is not connected. Cannot store Telegram messages.');
    err.isDbError = true;
    throw err;
  }

  const updates = await fetchTelegramUpdates(token.trim());

  let inserted = 0;
  let skipped = 0;

  for (const update of updates) {
    const postData = parseTelegramUpdateToPost(update);

    if (!postData) {
      skipped++;
      continue;
    }

    // Check for existing post to prevent duplicates
    const existing = await Post.findOne({
      platform: 'telegram',
      externalId: postData.externalId
    });

    if (existing) {
      skipped++;
      continue;
    }

    await Post.create(postData);
    inserted++;
  }

  return {
    fetched: updates.length,
    inserted,
    skipped
  };
};

module.exports = {
  syncTelegramUpdates,
  fetchTelegramUpdates,
  parseTelegramUpdateToPost
};
