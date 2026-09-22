const { analyzeTweet } = require('../src/services/nlp/historicalTextAnalyzer');

const testCases = [
  {
    name: 'Tech positive with aspects & joy',
    text: 'Absolutely love the new AI features and speed! The performance is outstanding and super fast #AI #tech',
    username: 'dev_alex',
    likes: 42,
    retweets: 5
  },
  {
    name: 'Tech negative with reliability/bug & anger',
    text: 'Terrible crash bug in the latest system release. Uptime is completely ruined and I am furious! #technology',
    username: 'coder_sam98214',
    likes: 3,
    retweets: 1
  },
  {
    name: 'Negation handling (not good/not happy)',
    text: 'The battery life and support is not good and not happy with the pricing at all.',
    username: 'sarah_m',
    likes: 12,
    retweets: 2
  },
  {
    name: 'Business & stock positive',
    text: 'Great quarterly earnings and revenue growth for the company. Excellent stock investment! #finance #business',
    username: 'market_watch',
    likes: 120,
    retweets: 30
  },
  {
    name: 'Politics with fear/crisis',
    text: 'Major political crisis as congress fails to pass the healthcare and tax policy reform before election. #politics',
    username: 'news_bulletin',
    likes: 85,
    retweets: 40
  },
  {
    name: 'Sports victory & celebration',
    text: 'What an incredible championship win! The team played with amazing energy to score the final goal! #sports #football',
    username: 'sporty_fan',
    likes: 540,
    retweets: 92
  },
  {
    name: 'Entertainment & music delight',
    text: 'Watching this beautiful new movie film trailer. The music and actors are wonderful! #entertainment',
    username: 'cinema_lover',
    likes: 67,
    retweets: 8
  },
  {
    name: 'Health & medical with anticipation',
    text: 'Doctors announce promising medical therapy and clinical care for patient wellness. Hoping for recovery soon!',
    username: 'health_beat',
    likes: 95,
    retweets: 14
  },
  {
    name: 'Bot-like spam with high hashtag/mention density and trailing digits',
    text: '#crypto #money #tech #giveaway #win @user1 @user2 @user3 @user4 follow and retweet to win free tokens right now!!!!!!!!',
    username: 'promo_bot894218',
    likes: 0,
    retweets: 120
  },
  {
    name: 'General neutral statement',
    text: 'We are scheduled to hold the regular Tuesday meeting at the downtown office tomorrow morning.',
    username: 'david_lee',
    likes: 4,
    retweets: 0
  },
  {
    name: 'Edge case: Empty text',
    text: '',
    username: 'empty_user',
    likes: 0,
    retweets: 0
  },
  {
    name: 'Edge case: Missing username and null inputs',
    text: 'Nice clean user interface and simple usability.',
    username: null,
    likes: null,
    retweets: null
  }
];

console.log('='.repeat(80));
console.log('RUNNING HISTORICAL TEXT ANALYZER VERIFICATION SUITE');
console.log('='.repeat(80));

let allTestsPassed = true;

testCases.forEach((tc, idx) => {
  console.log(`\n--- Test Case ${idx + 1}: ${tc.name} ---`);
  const result = analyzeTweet(tc.text, tc.username, tc.likes, tc.retweets);

  console.log(`Text: "${tc.text}"`);
  console.log(`Username: ${tc.username} | Likes: ${tc.likes} | Retweets: ${tc.retweets}`);
  console.log(`Sentiment: ${result.sentiment} (Score: ${result.sentimentScore})`);
  console.log(`Topic: ${result.topicName} (${result.topicId})`);
  console.log(`Emotions: ${JSON.stringify(result.emotions)}`);
  console.log(`Aspects: ${JSON.stringify(result.aspects)}`);
  console.log(`Bot Score: ${result.botScore}`);

  // Invariants checking
  const validSentiments = ['positive', 'negative', 'neutral'];
  if (!validSentiments.includes(result.sentiment)) {
    console.error(`FAIL: Invalid sentiment: ${result.sentiment}`);
    allTestsPassed = false;
  }
  if (typeof result.sentimentScore !== 'number' || isNaN(result.sentimentScore)) {
    console.error(`FAIL: Invalid sentimentScore: ${result.sentimentScore}`);
    allTestsPassed = false;
  }
  if (result.sentimentScore < -1.01 || result.sentimentScore > 1.01) {
    console.error(`FAIL: sentimentScore out of range [-1, 1]: ${result.sentimentScore}`);
    allTestsPassed = false;
  }
  if (typeof result.botScore !== 'number' || isNaN(result.botScore)) {
    console.error(`FAIL: Invalid botScore: ${result.botScore}`);
    allTestsPassed = false;
  }
  if (result.botScore < 0.0 || result.botScore > 1.0) {
    console.error(`FAIL: botScore out of range [0, 1]: ${result.botScore}`);
    allTestsPassed = false;
  }
  if (!result.topicId || !result.topicName) {
    console.error(`FAIL: Missing topicId or topicName`);
    allTestsPassed = false;
  }
});

// Determinism test
console.log('\n--- Determinism Test ---');
const sampleText = 'Outstanding fast speed and excellent cloud technology support!';
const run1 = analyzeTweet(sampleText, 'user_test', 10, 2);
const run2 = analyzeTweet(sampleText, 'user_test', 10, 2);
const isDeterministic = JSON.stringify(run1) === JSON.stringify(run2);
console.log(`Determinism check (run1 === run2): ${isDeterministic ? 'PASSED ✅' : 'FAILED ❌'}`);
if (!isDeterministic) allTestsPassed = false;

// Empty text safety test
console.log('\n--- Empty/Null Safety Test ---');
const emptyRun = analyzeTweet(null, null, null, null);
console.log('Empty run result:', JSON.stringify(emptyRun));
const emptySafe = emptyRun.sentiment === 'neutral' && emptyRun.topicId === 'general' && Array.isArray(emptyRun.emotions);
console.log(`Empty/Null safety check: ${emptySafe ? 'PASSED ✅' : 'FAILED ❌'}`);
if (!emptySafe) allTestsPassed = false;

console.log('\n' + '='.repeat(80));
console.log(`ALL TEST SUITE CHECKS: ${allTestsPassed ? 'PASSED ✅' : 'FAILED ❌'}`);
console.log('='.repeat(80));
