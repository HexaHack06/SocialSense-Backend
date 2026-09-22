/**
 * Historical Twitter NLP & Text Analyzer
 *
 * Lightweight, deterministic, local text analysis for historical Twitter records.
 * Provides:
 *   1. Sentiment analysis & normalized scoring with negation handling
 *   2. Topic classification (technology, business, politics, entertainment, sports, health, general)
 *   3. Emotion detection (joy, trust, anticipation, anger, fear, sadness, surprise)
 *   4. Aspect detection (customer support, pricing, reliability, features, performance, quality, security, usability)
 *   5. Heuristic bot score (0.00 to 1.00) based on observable metadata and text patterns
 *
 * Zero external API dependencies, zero network requests, fully deterministic.
 */

// ============================================================================
// 1. SENTIMENT LEXICON & RULES
// ============================================================================

const SENTIMENT_LEXICON = {
  // Strong Positive (+3 to +4)
  excellent: 3.5, amazing: 4.0, wonderful: 3.5, fantastic: 4.0, superb: 3.5,
  brilliant: 3.5, outstanding: 3.5, awesome: 3.5, love: 3.2, loved: 3.2,
  loves: 3.2, loving: 3.2, perfect: 3.5, perfection: 3.5, best: 3.2,
  flawless: 3.5, incredible: 3.5, masterpiece: 4.0, triumph: 3.0, glorious: 3.0,

  // Moderate Positive (+1.5 to +2.5)
  good: 2.0, great: 2.5, nice: 1.8, cool: 1.5, happy: 2.2, glad: 1.8,
  delight: 2.5, delighted: 2.5, helpful: 2.0, fast: 1.5, efficient: 2.0,
  reliable: 2.2, safe: 1.8, secure: 2.0, solid: 1.8, strong: 1.6,
  enjoy: 2.0, enjoyed: 2.0, enjoying: 2.0, recommend: 2.2, recommended: 2.2,
  succeed: 2.2, success: 2.5, successful: 2.5, successfully: 2.5, praise: 2.0,
  win: 2.2, winning: 2.2, winner: 2.2, won: 2.0, benefit: 2.0,
  beneficial: 2.0, thank: 1.5, thanks: 1.5, excited: 2.2, exciting: 2.2,
  clean: 1.5, beauty: 2.0, beautiful: 2.5, progress: 2.0, improve: 2.0,
  improved: 2.0, improvement: 2.0, ease: 1.8, easy: 1.8, positive: 2.0,
  valuable: 2.0, trust: 2.2, trusted: 2.2, worthy: 1.8, honest: 2.0,
  friendly: 2.0, top: 1.5, smart: 2.0, genius: 2.5, inspiring: 2.5,
  inspire: 2.0, favor: 1.5, favorite: 2.0, peace: 2.0, peaceful: 2.0,

  // Mild Positive (+0.8 to +1.2)
  fine: 1.0, okay: 0.8, decent: 1.2, fair: 0.8, useful: 1.2,
  like: 1.2, liked: 1.2, likes: 1.2, hope: 1.2, hoping: 1.2,
  promising: 1.5, stable: 1.2, ready: 1.0, clear: 1.0, fresh: 1.0,

  // Mild Negative (-0.8 to -1.2)
  slow: -1.2, dull: -1.0, weird: -0.8, odd: -0.8, weak: -1.2,
  tough: -1.0, hard: -0.8, difficult: -1.2, cost: -0.5, expensive: -1.5,
  doubt: -1.0, doubtful: -1.2, risk: -1.2, risky: -1.5, delay: -1.2,
  delayed: -1.2, confusion: -1.2, confusing: -1.2, complicated: -1.2,

  // Moderate Negative (-1.5 to -2.5)
  bad: -2.0, poor: -2.0, poorly: -2.0, issue: -1.5, issues: -1.5,
  problem: -1.8, problems: -1.8, error: -1.8, errors: -1.8, bug: -1.5,
  bugs: -1.5, fail: -2.2, failed: -2.2, failing: -2.2, failure: -2.2,
  annoy: -2.0, annoyed: -2.0, annoying: -2.2, broken: -2.2, broke: -2.0,
  break: -1.5, sad: -2.0, upset: -2.0, hurt: -2.0, pain: -2.0,
  painful: -2.2, drop: -1.5, dropped: -1.5, lose: -2.0, losing: -2.0,
  loss: -2.0, lost: -1.8, glitch: -1.8, crash: -2.2, crashed: -2.2,
  drain: -1.5, worry: -1.8, worried: -1.8, damage: -2.0, damaged: -2.0,
  unfair: -2.0, wrong: -1.8, waste: -2.2, wasted: -2.2, wasting: -2.2,
  useless: -2.5, hate: -2.8, hated: -2.8, hates: -2.8, hating: -2.8,
  dislike: -1.8, disappointed: -2.2, disappointing: -2.2, disappointment: -2.2,

  // Strong Negative (-3.0 to -4.0)
  terrible: -3.5, awful: -3.5, horrible: -3.5, horrific: -3.8, disastrous: -3.5,
  disaster: -3.5, nightmare: -3.5, garbage: -3.2, rubbish: -3.0, trash: -3.0,
  scam: -3.8, fraud: -3.8, fraudster: -3.8, abusive: -3.5, corrupt: -3.5,
  corruption: -3.5, toxic: -3.2, disgust: -3.0, disgusting: -3.2, crisis: -2.8,
  catastrophe: -3.8, catastrophic: -3.8, shameful: -3.2, shame: -2.8, worst: -3.5
};

// Negation words inverting sentiment within a forward window of 3 tokens
const NEGATION_WORDS = new Set([
  'not', 'never', 'no', 'hardly', 'scarcely', 'barely', 'neither', 'nor',
  'without', "don't", 'dont', "doesn't", 'doesnt', "didn't", 'didnt',
  "won't", 'wont', "wouldn't", 'wouldnt', "can't", 'cant', "cannot",
  "couldn't", 'couldnt', "isn't", 'isnt', "aren't", 'arent', "wasn't",
  'wasnt', "weren't", 'werent', "haven't", 'havent', "hasn't", 'hasnt'
]);

// Intensifiers multiplying sentiment score
const INTENSIFIERS = {
  very: 1.4, really: 1.35, extremely: 1.5, super: 1.4, totally: 1.3,
  absolutely: 1.5, highly: 1.35, incredibly: 1.45, deeply: 1.3, especially: 1.25,
  so: 1.25, too: 1.2
};

// Diminishers reducing sentiment score
const DIMINISHERS = {
  slightly: 0.6, somewhat: 0.7, barely: 0.6, a_bit: 0.7, kind_of: 0.7, sort_of: 0.7
};

// ============================================================================
// 2. TOPIC CLASSIFICATION TAXONOMY
// ============================================================================

const TOPIC_CATEGORIES = [
  {
    id: 'technology',
    name: 'Technology',
    keywords: [
      'tech', 'technology', 'ai', 'software', 'hardware', 'code', 'coding',
      'developer', 'programming', 'cloud', 'cyber', 'data', 'algorithm',
      'robot', 'computer', 'internet', 'web', 'python', 'javascript', 'api',
      'digital', 'server', 'database', 'machine learning', 'ml', 'automation',
      'app', 'mobile', 'device', 'processor', 'crypto', 'blockchain', 'neural',
      'linux', 'windows', 'apple', 'google', 'microsoft', 'laptop', 'browser'
    ],
    hashtags: [
      '#tech', '#technology', '#ai', '#artificialintelligence', '#coding',
      '#developer', '#cloud', '#cybersecurity', '#machinelearning', '#datascience',
      '#software', '#webdev', '#crypto', '#crypto'
    ]
  },
  {
    id: 'business',
    name: 'Business',
    keywords: [
      'business', 'market', 'economy', 'finance', 'money', 'stock', 'stocks',
      'shares', 'investment', 'investor', 'investing', 'trade', 'trading',
      'company', 'corporate', 'revenue', 'profit', 'sales', 'industry',
      'price', 'cost', 'tax', 'taxes', 'banking', 'bank', 'startup',
      'ceo', 'enterprise', 'commerce', 'commercial', 'dollar', 'inflation',
      'fund', 'funding', 'growth', 'quarter', 'earnings', 'acquisition'
    ],
    hashtags: [
      '#business', '#finance', '#economy', '#stocks', '#investing', '#startup',
      '#money', '#trading', '#wealth', '#marketing'
    ]
  },
  {
    id: 'politics',
    name: 'Politics',
    keywords: [
      'politics', 'political', 'government', 'policy', 'policies', 'election',
      'vote', 'voting', 'voter', 'voters', 'congress', 'senate', 'senator',
      'president', 'presidential', 'minister', 'law', 'legal', 'legislation',
      'court', 'judge', 'rights', 'democrat', 'republican', 'parliament',
      'state', 'official', 'party', 'candidate', 'campaign', 'democracy',
      'diplomacy', 'nation', 'national', 'treaty', 'protest', 'reform'
    ],
    hashtags: [
      '#politics', '#government', '#election', '#vote', '#democracy',
      '#congress', '#senate', '#policy'
    ]
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    keywords: [
      'entertainment', 'movie', 'movies', 'film', 'films', 'cinema', 'music',
      'song', 'songs', 'artist', 'actor', 'actress', 'celebrity', 'tv',
      'show', 'shows', 'series', 'game', 'gaming', 'gamer', 'concert',
      'theatre', 'theater', 'album', 'art', 'hollywood', 'dance', 'comedy',
      'humor', 'festival', 'novel', 'drama', 'netflix', 'episode', 'trailer'
    ],
    hashtags: [
      '#entertainment', '#movies', '#music', '#gaming', '#cinema', '#art',
      '#hollywood', '#tvshow'
    ]
  },
  {
    id: 'sports',
    name: 'Sports',
    keywords: [
      'sports', 'sport', 'football', 'soccer', 'basketball', 'cricket',
      'baseball', 'tennis', 'golf', 'rugby', 'hockey', 'match', 'matches',
      'tournament', 'championship', 'league', 'player', 'players', 'coach',
      'team', 'teams', 'goal', 'score', 'scored', 'race', 'racing',
      'athlete', 'athletes', 'olympics', 'cup', 'stadium', 'champions'
    ],
    hashtags: [
      '#sports', '#football', '#soccer', '#basketball', '#cricket', '#tennis',
      '#athlete', '#championship', '#nba', '#premierleague'
    ]
  },
  {
    id: 'health',
    name: 'Health',
    keywords: [
      'health', 'healthy', 'medical', 'medicine', 'hospital', 'doctor',
      'nurse', 'disease', 'illness', 'virus', 'infection', 'vaccine',
      'therapy', 'treatment', 'wellness', 'fitness', 'diet', 'nutrition',
      'mental health', 'cancer', 'clinic', 'patient', 'patients', 'care',
      'symptom', 'symptoms', 'exercise', 'workout', 'wellbeing'
    ],
    hashtags: [
      '#health', '#wellness', '#fitness', '#medicine', '#mentalhealth',
      '#healthcare', '#healthy'
    ]
  }
];

// ============================================================================
// 3. EMOTION DETECTION LEXICON
// ============================================================================

const EMOTION_LEXICON = {
  joy: [
    'happy', 'glad', 'joy', 'delight', 'delighted', 'celebrate', 'celebration',
    'wonderful', 'awesome', 'smile', 'smiling', 'laugh', 'laughing', 'love',
    'loved', 'blessed', 'cheer', 'cheerful', 'excited', 'exciting', 'pleasure',
    'fun', 'enjoy', 'enjoyed', 'fantastic', 'ecstatic', 'thrilled'
  ],
  trust: [
    'trust', 'trusted', 'reliable', 'reliability', 'honest', 'honesty',
    'faith', 'integrity', 'secure', 'security', 'confidence', 'confident',
    'recommend', 'loyal', 'loyalty', 'truth', 'true', 'believe', 'safe',
    'dependable', 'solid', 'guarantee', 'proven'
  ],
  anticipation: [
    'expect', 'expected', 'expecting', 'expectation', 'hope', 'hoping',
    'waiting', 'wait', 'soon', 'plan', 'planning', 'upcoming', 'predict',
    'prediction', 'future', 'ready', 'prepare', 'preparing', 'launch',
    'countdown', 'ahead', 'look forward', 'looking forward'
  ],
  anger: [
    'angry', 'furious', 'outrage', 'outraged', 'mad', 'rage', 'annoy',
    'annoyed', 'annoying', 'hate', 'hated', 'irritate', 'irritated',
    'disgust', 'disgusted', 'cheat', 'cheated', 'frustrate', 'frustrated',
    'frustrating', 'offensive', 'infuriating', 'scam'
  ],
  fear: [
    'fear', 'fearful', 'afraid', 'scared', 'terror', 'panic', 'threat',
    'threatened', 'danger', 'dangerous', 'worry', 'worried', 'nervous',
    'anxious', 'anxiety', 'crisis', 'risk', 'risky', 'alarm', 'alarming',
    'dread', 'vulnerable'
  ],
  sadness: [
    'sad', 'sadness', 'depressed', 'depression', 'grief', 'cry', 'crying',
    'unhappy', 'sorrow', 'mourn', 'mourning', 'loss', 'lost', 'pain',
    'painful', 'heartbroken', 'disappointed', 'disappointing', 'lonely',
    'tragic', 'tragedy', 'hopeless', 'gloomy'
  ],
  surprise: [
    'surprise', 'surprised', 'surprising', 'shock', 'shocked', 'shocking',
    'amazed', 'amazing', 'astonish', 'astonished', 'unexpected',
    'unbelievable', 'stunned', 'stunning', 'sudden', 'suddenly', 'wonder'
  ]
};

// ============================================================================
// 4. ASPECT DETECTION LEXICON
// ============================================================================

const ASPECT_DEFINITIONS = [
  {
    name: 'Customer Support',
    key: 'customer_support',
    keywords: ['support', 'service', 'helpdesk', 'agent', 'rep', 'representative', 'ticket', 'assistance', 'staff', 'care']
  },
  {
    name: 'Pricing',
    key: 'pricing',
    keywords: ['price', 'pricing', 'cost', 'expensive', 'cheap', 'affordable', 'fee', 'fees', 'subscription', 'bill', 'billing', 'charge', 'tax']
  },
  {
    name: 'Reliability',
    key: 'reliability',
    keywords: ['reliable', 'reliability', 'uptime', 'downtime', 'crash', 'down', 'stable', 'stability', 'freeze', 'broken', 'outage', 'consistent']
  },
  {
    name: 'Features',
    key: 'features',
    keywords: ['feature', 'features', 'functionality', 'capability', 'capabilities', 'integration', 'integrations', 'option', 'options', 'setting', 'settings']
  },
  {
    name: 'Performance',
    key: 'performance',
    keywords: ['speed', 'fast', 'slow', 'performance', 'lag', 'latency', 'responsive', 'responsiveness', 'efficient', 'efficiency', 'quick']
  },
  {
    name: 'Quality',
    key: 'quality',
    keywords: ['quality', 'built', 'craft', 'design', 'material', 'standard', 'standards', 'flawless', 'durable', 'durability', 'finish']
  },
  {
    name: 'Security',
    key: 'security',
    keywords: ['security', 'secure', 'privacy', 'private', 'safe', 'safety', 'hack', 'hacked', 'leak', 'leaked', 'vulnerability', 'breach', 'encrypt']
  },
  {
    name: 'Usability',
    key: 'usability',
    keywords: ['usable', 'usability', 'intuitive', 'easy', 'simple', 'clean', 'confusing', 'complex', 'clunky', 'ui', 'ux', 'interface', 'experience']
  }
];

// ============================================================================
// 5. HELPER FUNCTIONS: TOKENIZATION & CLEANING
// ============================================================================

/**
 * Tokenize text into lowercase words while preserving hashtags
 */
const tokenize = (text) => {
  if (!text || typeof text !== 'string') return [];
  // Match words, contractions, and hashtags
  const matches = text.toLowerCase().match(/#?[\w']+/g);
  return matches || [];
};

/**
 * Extract clean words without leading symbols or apostrophes
 */
const cleanWord = (w) => {
  return w.replace(/^[^a-z0-9#]+|[^a-z0-9]+$/gi, '').toLowerCase();
};

// ============================================================================
// 6. CORE ANALYZER IMPLEMENTATION
// ============================================================================

/**
 * 1. Calculate sentiment and normalized score with negation support
 */
const calculateSentiment = (tokens) => {
  if (!tokens || tokens.length === 0) {
    return { sentiment: 'neutral', sentimentScore: 0.0 };
  }

  let totalScore = 0.0;
  let scoredWordsCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const rawWord = tokens[i];
    const word = cleanWord(rawWord);

    if (SENTIMENT_LEXICON.hasOwnProperty(word)) {
      let wordScore = SENTIMENT_LEXICON[word];

      // Check negation in previous 1 to 3 tokens
      let isNegated = false;
      const lookbackStart = Math.max(0, i - 3);
      for (let j = i - 1; j >= lookbackStart; j--) {
        const prevWord = cleanWord(tokens[j]);
        if (NEGATION_WORDS.has(prevWord)) {
          isNegated = true;
          break;
        }
      }

      if (isNegated) {
        // Invert sentiment and slightly dampen
        wordScore = wordScore * -0.85;
      }

      // Check intensifiers / diminishers in immediate previous token
      if (i > 0) {
        const prevImmediate = cleanWord(tokens[i - 1]);
        if (INTENSIFIERS.hasOwnProperty(prevImmediate)) {
          wordScore *= INTENSIFIERS[prevImmediate];
        } else if (DIMINISHERS.hasOwnProperty(prevImmediate)) {
          wordScore *= DIMINISHERS[prevImmediate];
        }
      }

      totalScore += wordScore;
      scoredWordsCount++;
    }
  }

  if (scoredWordsCount === 0) {
    return { sentiment: 'neutral', sentimentScore: 0.0 };
  }

  // Smoothly normalize to approximately [-1.0, 1.0]
  // Using hyperbolic-style scaling: score / sqrt(score^2 + alpha)
  const normalized = totalScore / Math.sqrt(totalScore * totalScore + 9.0);
  const roundedScore = Number(normalized.toFixed(3));

  let sentiment = 'neutral';
  if (roundedScore > 0.05) {
    sentiment = 'positive';
  } else if (roundedScore < -0.05) {
    sentiment = 'negative';
  }

  return {
    sentiment,
    sentimentScore: roundedScore
  };
};

/**
 * 2. Classify topic based on keywords and hashtags
 */
const classifyTopic = (text, tokens) => {
  const lowerText = (text || '').toLowerCase();
  let bestTopic = { id: 'general', name: 'General' };
  let maxScore = 0;

  for (const category of TOPIC_CATEGORIES) {
    let score = 0;

    // Check hashtags (higher weight: 2.5 per match)
    for (const tag of category.hashtags) {
      if (lowerText.includes(tag)) {
        score += 2.5;
      }
    }

    // Check keywords (weight: 1.0 per match)
    for (const kw of category.keywords) {
      // Use word boundary check or exact token match
      if (kw.includes(' ')) {
        if (lowerText.includes(kw)) score += 1.5;
      } else {
        const count = tokens.filter(t => cleanWord(t) === kw).length;
        score += count * 1.0;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestTopic = { id: category.id, name: category.name };
    }
  }

  // If score is too low or 0, fallback to general
  if (maxScore < 0.8) {
    return { topicId: 'general', topicName: 'General' };
  }

  return {
    topicId: bestTopic.id,
    topicName: bestTopic.name
  };
};

/**
 * 3. Detect emotions supported by text evidence (with negation awareness)
 */
const detectEmotions = (tokens) => {
  if (!tokens || tokens.length === 0) return [];

  const emotionCounts = {};

  for (let i = 0; i < tokens.length; i++) {
    const rawWord = tokens[i];
    const token = cleanWord(rawWord);

    // Check if negated by preceding 1-2 tokens
    let isNegated = false;
    const lookbackStart = Math.max(0, i - 2);
    for (let j = i - 1; j >= lookbackStart; j--) {
      if (NEGATION_WORDS.has(cleanWord(tokens[j]))) {
        isNegated = true;
        break;
      }
    }

    for (const [emotion, words] of Object.entries(EMOTION_LEXICON)) {
      if (words.includes(token)) {
        // If a positive emotion word is negated (e.g. "not happy"), do not credit "joy"
        if (isNegated && (emotion === 'joy' || emotion === 'trust' || emotion === 'anticipation')) {
          // Attribute to sadness/anger or skip positive emotion
          emotionCounts['sadness'] = (emotionCounts['sadness'] || 0) + 1;
          continue;
        }

        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      }
    }
  }

  const results = [];
  for (const [emotion, count] of Object.entries(emotionCounts)) {
    // Score between 0.40 and 0.95 depending on frequency
    const score = Number(Math.min(0.95, 0.45 + (count - 1) * 0.2).toFixed(2));
    results.push({
      name: emotion,
      score
    });
  }

  // Sort descending by score
  return results.sort((a, b) => b.score - a.score);
};

/**
 * 4. Detect aspects supported by text evidence and contextual sentiment
 */
const detectAspects = (text, tokens, globalSentiment, globalScore) => {
  if (!text || !tokens || tokens.length === 0) return [];

  const cleanedTokens = tokens.map(cleanWord);
  const detectedAspects = [];

  for (const def of ASPECT_DEFINITIONS) {
    let matchCount = 0;
    let aspectTokensIndices = [];

    for (let i = 0; i < cleanedTokens.length; i++) {
      const t = cleanedTokens[i];
      if (def.keywords.includes(t)) {
        matchCount++;
        aspectTokensIndices.push(i);
      }
    }

    if (matchCount > 0) {
      // Find local sentiment around the aspect mentions (window of -5 to +4 tokens to capture negations)
      let localScores = [];
      for (const idx of aspectTokensIndices) {
        const start = Math.max(0, idx - 5);
        const end = Math.min(tokens.length - 1, idx + 4);
        const windowTokens = tokens.slice(start, end + 1);
        const { sentimentScore } = calculateSentiment(windowTokens);
        if (Math.abs(sentimentScore) > 0.05) {
          localScores.push(sentimentScore);
        }
      }

      let aspectSentiment = globalSentiment;
      let aspectScore = 0.55;

      if (localScores.length > 0) {
        const avgLocalScore = localScores.reduce((a, b) => a + b, 0) / localScores.length;
        if (avgLocalScore > 0.05) aspectSentiment = 'positive';
        else if (avgLocalScore < -0.05) aspectSentiment = 'negative';
        else aspectSentiment = 'neutral';
        aspectScore = Number(Math.min(0.95, 0.55 + Math.abs(avgLocalScore) * 0.4).toFixed(2));
      } else {
        aspectScore = Number(Math.min(0.95, 0.50 + Math.abs(globalScore) * 0.4).toFixed(2));
      }

      detectedAspects.push({
        name: def.key,
        sentiment: aspectSentiment,
        score: aspectScore
      });
    }
  }

  return detectedAspects;
};

/**
 * 5. Calculate heuristic bot score based on observable dataset features
 *
 * Factors and Weights:
 *  - Username Pattern (Weight 0.25):
 *      Trailing random digits (>3 digits = +0.18, 1-3 digits = +0.06).
 *      Empty or non-string username = +0.20.
 *  - Hashtag Density (Weight 0.20):
 *      High hashtag ratio (>25% of tokens) or >=4 hashtags indicates promotional/bot spam.
 *  - Mention Density (Weight 0.15):
 *      High mention frequency (>3 mentions) indicates mention spam.
 *  - Engagement Discrepancy (Weight 0.20):
 *      High retweets with zero likes indicates artificial retweet amplification rings (+0.20).
 *      High normal engagement (likes > 0) reduces bot score (-0.08).
 *  - Text Length & Repetition (Weight 0.20):
 *      Repetitive character runs (e.g. "aaaaa", "!!!!!") or extreme brevity (<10 chars).
 *
 * Baseline: 0.12 (standard human baseline).
 * Clamped strictly between 0.00 and 1.00.
 */
const calculateBotScore = (text, username, likes, retweets, tokens) => {
  let score = 0.12; // Baseline human account score

  // 1. Username pattern analysis
  if (!username || typeof username !== 'string' || username.trim() === '') {
    score += 0.20;
  } else {
    const cleanUser = username.trim();
    const trailingDigitsMatch = cleanUser.match(/\d+$/);
    if (trailingDigitsMatch) {
      const digitCount = trailingDigitsMatch[0].length;
      if (digitCount >= 4) {
        score += 0.22; // e.g. julie81928
      } else if (digitCount >= 2) {
        score += 0.08; // e.g. julie81
      }
    }

    // Completely numeric or alphanumeric soup
    if (/^[a-z0-9]{12,}$/i.test(cleanUser) && (cleanUser.match(/\d/g) || []).length > 5) {
      score += 0.15;
    }
  }

  const safeText = typeof text === 'string' ? text : '';
  const tokenCount = tokens ? tokens.length : 0;

  // 2. Hashtag density
  const hashtags = safeText.match(/#\w+/g) || [];
  if (tokenCount > 0) {
    const hashtagRatio = hashtags.length / tokenCount;
    if (hashtagRatio > 0.35 || hashtags.length >= 5) {
      score += 0.20;
    } else if (hashtagRatio > 0.20 || hashtags.length >= 3) {
      score += 0.10;
    }
  }

  // 3. Mention density
  const mentions = safeText.match(/@\w+/g) || [];
  if (mentions.length >= 4) {
    score += 0.18;
  } else if (mentions.length >= 2) {
    score += 0.06;
  }

  // 4. Engagement discrepancy
  const safeLikes = Number(likes) || 0;
  const safeRetweets = Number(retweets) || 0;

  if (safeRetweets > 20 && safeLikes === 0) {
    // Retweet-ring pattern
    score += 0.22;
  } else if (safeLikes > 50 && safeRetweets === 0) {
    score += 0.08;
  } else if (safeLikes > 5 && safeRetweets > 0) {
    // Organic two-way engagement reduces bot suspicion
    score -= 0.08;
  }

  // 5. Text length & character repetition
  if (safeText.length > 0 && safeText.length < 15) {
    score += 0.08; // Abnormally short
  }
  if (/([a-zA-Z!?.])\1{4,}/.test(safeText)) {
    score += 0.12; // Spammy repeated characters like "aaaaaa" or "!!!!!!!"
  }

  // Clamp strictly between 0.00 and 1.00
  const clamped = Math.max(0.0, Math.min(1.0, score));
  return Number(clamped.toFixed(2));
};

// ============================================================================
// 7. MAIN EXPORTED FUNCTION
// ============================================================================

/**
 * Main function to analyze a single tweet.
 *
 * @param {string} text - Raw tweet text
 * @param {string} [username] - Tweet author username
 * @param {number} [likes=0] - Number of likes
 * @param {number} [retweets=0] - Number of retweets / shares
 *
 * @returns {{
 *   sentiment: 'positive' | 'negative' | 'neutral',
 *   sentimentScore: number,
 *   topicId: string,
 *   topicName: string,
 *   emotions: Array<{ name: string, score: number }>,
 *   aspects: Array<{ name: string, sentiment: string, score: number }>,
 *   botScore: number
 * }}
 */
const analyzeTweet = (text, username = '', likes = 0, retweets = 0) => {
  try {
    const safeText = typeof text === 'string' ? text.trim() : '';
    const safeUsername = typeof username === 'string' ? username.trim() : '';
    const safeLikes = Number(likes) || 0;
    const safeRetweets = Number(retweets) || 0;

    // Tokenize
    const tokens = tokenize(safeText);

    // 1. Sentiment & Score
    const { sentiment, sentimentScore } = calculateSentiment(tokens);

    // 2. Topic Classification
    const { topicId, topicName } = classifyTopic(safeText, tokens);

    // 3. Emotion Detection
    const emotions = detectEmotions(tokens);

    // 4. Aspect Detection
    const aspects = detectAspects(safeText, tokens, sentiment, sentimentScore);

    // 5. Heuristic Bot Score
    const botScore = calculateBotScore(safeText, safeUsername, safeLikes, safeRetweets, tokens);

    return {
      sentiment,
      sentimentScore,
      topicId,
      topicName,
      emotions,
      aspects,
      botScore
    };
  } catch (err) {
    // Fail-safe fallback ensuring analyzer never crashes the caller
    console.error('Safe fallback in analyzeTweet:', err.message);
    return {
      sentiment: 'neutral',
      sentimentScore: 0.0,
      topicId: 'general',
      topicName: 'General',
      emotions: [],
      aspects: [],
      botScore: 0.20
    };
  }
};

module.exports = {
  analyzeTweet,
  calculateSentiment,
  classifyTopic,
  detectEmotions,
  detectAspects,
  calculateBotScore
};
