import type { BrandProfile, ComplianceTerm, KnowledgeItem } from '@helix/shared';

/** Mirror of supabase/seed.sql for offline / mock mode. */

export const seedBrand: Omit<BrandProfile, 'id' | 'org_id' | 'updated_at'> = {
  name: 'Helix Exchange',
  brand_voice:
    'Confident, precise and educational. Speak like a senior trader explaining to a curious newcomer — plain language, no hype, numbers over adjectives. Neutral on market direction; never promise outcomes.',
  target_audience: 'Crypto-curious retail traders, ages 22–40, global, English-first.',
  do_phrases: ['spot trading', 'self-custody', 'do your own research', 'risk-adjusted', 'market volatility'],
  dont_phrases: ['guaranteed profit', 'risk-free', 'sure thing', 'to the moon', 'financial advice', "can't lose"],
  glossary: {
    DEX: 'Decentralized Exchange',
    CEX: 'Centralized Exchange',
    APY: 'Annual Percentage Yield',
    slippage: 'The difference between expected and executed price',
    'liquidity pool': 'A pool of tokens locked in a smart contract that enables trading',
  },
  disclaimers: [
    'Cryptocurrency trading carries a high level of risk and may not be suitable for all investors. Prices are volatile and you may lose your entire principal. This content is for informational purposes only and is not financial advice.',
  ],
  target_markets: ['global', 'exclude-US'],
  default_language: 'en',
};

export const seedKnowledge: Omit<KnowledgeItem, 'id' | 'org_id' | 'created_at'>[] = [
  {
    type: 'product',
    title: 'Spot Trading Fees',
    content:
      'Spot maker/taker fee is 0.10% for regular users and 0.075% when paying with the platform token HELIX. VIP tiers reduce fees from 0.09% down to 0.02% based on 30-day volume.',
    tags: ['fees', 'spot', 'vip'],
    source_url: null,
    metadata: {},
  },
  {
    type: 'fact',
    title: 'Platform Token HELIX',
    content:
      'HELIX is the native utility token used for fee discounts, governance and launchpool rewards. Total supply 200,000,000, deflationary via quarterly buyback-and-burn.',
    tags: ['token', 'helix', 'tokenomics'],
    source_url: null,
    metadata: {},
  },
  {
    type: 'faq',
    title: 'How long do withdrawals take?',
    content:
      'Withdrawal times depend on the blockchain. BTC ~30 min after block confirmation, ETH ~5 min, SOL ~1 min. Withdrawals are paused during network congestion for safety.',
    tags: ['withdrawal', 'faq'],
    source_url: null,
    metadata: {},
  },
  {
    type: 'market_data',
    title: 'BTC dominance snapshot',
    content:
      'As of the latest snapshot, BTC dominance sits near 52%. Always cite a timestamp and source; never present market data as current without one.',
    tags: ['market', 'btc'],
    source_url: null,
    metadata: {},
  },
  {
    type: 'competitor',
    title: 'Competitor fee benchmark',
    content:
      'Top-3 CEX average spot taker fee is ~0.12%. Position Helix as competitive at 0.10% / 0.075% with HELIX.',
    tags: ['competitor', 'fees'],
    source_url: null,
    metadata: {},
  },
];

export const seedCompliance: Omit<ComplianceTerm, 'id' | 'org_id' | 'created_at'>[] = [
  { term: 'guaranteed profit', category: 'banned', severity: 'high', reason: 'Promises returns — illegal in most jurisdictions.', replacement: 'Describe mechanics, not outcomes.' },
  { term: 'risk-free', category: 'banned', severity: 'high', reason: 'No crypto product is risk-free.', replacement: 'State the risks explicitly.' },
  { term: 'sure thing', category: 'banned', severity: 'medium', reason: 'Implies certainty of outcome.', replacement: 'Reframe as probabilistic.' },
  { term: 'financial advice', category: 'banned', severity: 'high', reason: 'Platform is not a registered advisor.', replacement: 'Add: "for informational purposes only".' },
  { term: 'to the moon', category: 'banned', severity: 'low', reason: 'Hype language, unprofessional.', replacement: 'Use neutral, data-based phrasing.' },
  { term: 'risk disclaimer', category: 'required', severity: 'high', reason: 'All market/trading content must include the risk disclaimer.', replacement: 'Append the org risk disclaimer.' },
];
