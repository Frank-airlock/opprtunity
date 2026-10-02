// Classifies a raw opportunity item: capital need, topics, region, scam red-flags.

const FREE_SIGNALS = [
  'free', 'airdrop', 'no investment', 'zero capital', '$0', 'giveaway',
  'sign up bonus', 'signup bonus', 'welcome bonus', 'bounty', 'learn to earn',
  'learn-and-earn', 'faucet', 'grant', 'scholarship', 'free to join', 'no fee',
  'no experience needed', 'without investment', 'for free'
];

const LOW_CAPITAL_SIGNALS = [
  'under $', 'start with', 'starting with', 'low capital', 'small capital',
  'low cost', 'low startup', 'bootstrap', 'on a budget', 'tight budget',
  'with $5', 'with $10', 'with $20', 'with $50', 'with $100', 'with $500',
  'under $100', 'under $500', 'dropshipping', 'print on demand', 'reselling',
  'resell', 'flip ', 'flipping', 'pos business', 'pos agent', 'mini importation',
  '₦', 'naira', 'thrift'
];

const TOPIC_SIGNALS = {
  crypto: ['crypto', 'bitcoin', 'btc', 'ethereum', ' eth', 'airdrop', 'token',
    'usdt', 'usdc', 'defi', 'web3', 'blockchain', 'solana', 'nft', 'wallet',
    'testnet', 'binance', 'bybit', 'altcoin', 'memecoin'],
  jobs: ['job', 'hiring', 'vacancy', 'remote work', 'work from home', 'freelance',
    'gig', 'transcription', 'data entry', 'virtual assistant', 'customer support',
    'copywriter', 'content writer', 'tutor', 'recruiter', 'apply now', 'salary'],
  business: ['business', 'side hustle', 'hustle', 'ecommerce', 'e-commerce',
    'dropship', 'print on demand', 'mini importation', 'thrift', 'pos business',
    'pos agent', 'small shop', 'startup', 'entrepreneur'],
  grants: ['grant', 'funding', 'sme', 'fellowship', 'accelerator', 'incubator',
    'scholarship', 'loan', 'yemi', 'empowerment program'],
  microtasks: ['survey', 'microtask', 'clickworker', 'mturk', 'paid to',
    'watch video', 'cashback', 'receipt', 'beermoney', 'swagbucks', 'appen',
    'user testing', 'playtest']
};

const NIGERIA_SIGNALS = ['nigeria', 'naija', 'naira', '₦', 'lagos', 'abuja',
  'ngn', 'paystack', 'flutterwave', 'oyo', 'ibadan', 'nigerian', 'kobo'];

const RED_FLAGS = [
  { re: /(pay|deposit|send|transfer)\b[^.\n]{0,35}\b(fee|first|upfront|before|to (start|earn|get paid|unlock|activate|register|withdraw))/i, label: 'Asks for upfront payment' },
  { re: /guaranteed (profit|returns?|income|payout)/i, label: 'Guaranteed returns' },
  { re: /seed phrase|private key|wallet (login|verification)/i, label: 'Asks for wallet keys' },
  { re: /\b(dm|message|whatsapp|telegram)\b.{0,25}\b(me|us|now|for (details|more))/i, label: 'DM / WhatsApp funnel' },
  { re: /double your|triple your|multiply your|\b100x\b|\b10x your/i, label: 'Unrealistic returns' },
  { re: /hurry|only \d+ slots|expires? (today|soon)|act fast|limited spots/i, label: 'Pressure tactics' }
];

const includesAny = (text, arr) => arr.some(s => text.includes(s));

export function classify(item) {
  const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();

  // --- capital requirement ---
  const hasFree = includesAny(text, FREE_SIGNALS);
  const hasLow = includesAny(text, LOW_CAPITAL_SIGNALS);
  let capital;
  if (hasFree && !hasLow) capital = 'free';
  else if (hasLow && !hasFree) capital = 'low';
  else if (hasFree && hasLow) capital = item.presetCapital || 'free';
  else capital = item.presetCapital || 'unknown';

  // --- topics ---
  const topics = new Set(item.presetTopics || []);
  for (const [topic, words] of Object.entries(TOPIC_SIGNALS)) {
    if (includesAny(text, words)) topics.add(topic);
  }

  // --- region ---
  const region = item.presetRegion
    || (includesAny(text, NIGERIA_SIGNALS) ? 'nigeria' : 'global');

  // --- scam red flags ---
  const joined = `${item.title || ''}\n${item.snippet || ''}`;
  const risk = RED_FLAGS.filter(f => f.re.test(joined)).map(f => f.label);

  return {
    capital,
    topics: [...topics],
    region,
    risk
  };
}
