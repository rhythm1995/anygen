-- Helix seed data. Inserts a default org, brand profile, sample knowledge and
-- compliance terms. Idempotent-ish: guarded by NOT EXISTS on the default org.

insert into public.orgs (id, name, slug)
select '00000000-0000-0000-0000-000000000001', 'Helix Demo Exchange', 'default'
where not exists (select 1 from public.orgs where slug = 'default');

insert into public.brand_profiles
  (org_id, name, brand_voice, target_audience, do_phrases, dont_phrases, glossary, disclaimers, target_markets, default_language)
select
  '00000000-0000-0000-0000-000000000001',
  'Helix Exchange',
  'Confident, precise and educational. Speak like a senior trader explaining to a curious newcomer — plain language, no hype, numbers over adjectives. Neutral on market direction; never promise outcomes.',
  'Crypto-curious retail traders, ages 22–40, global, English-first.',
  ARRAY['spot trading','self-custody','do your own research','risk-adjusted','market volatility'],
  ARRAY['guaranteed profit','risk-free','sure thing','to the moon','financial advice','can''t lose'],
  '{"DEX":"Decentralized Exchange","CEX":"Centralized Exchange","APY":"Annual Percentage Yield","slippage":"The difference between expected and executed price","liquidity pool":"A pool of tokens locked in a smart contract that enables trading"}'::jsonb,
  ARRAY['Cryptocurrency trading carries a high level of risk and may not be suitable for all investors. Prices are volatile and you may lose your entire principal. This content is for informational purposes only and is not financial advice.'],
  ARRAY['global','exclude-US'],
  'en'
where not exists (select 1 from public.brand_profiles where name = 'Helix Exchange');

insert into public.knowledge_items (org_id, type, title, content, tags)
values
  ('00000000-0000-0000-0000-000000000001','product','Spot Trading Fees','Spot maker/taker fee is 0.10% for regular users and 0.075% when paying with the platform token HELIX. VIP tiers reduce fees from 0.09% down to 0.02% based on 30-day volume.', ARRAY['fees','spot','vip']),
  ('00000000-0000-0000-0000-000000000001','fact','Platform Token HELIX','HELIX is the native utility token used for fee discounts, governance and launchpool rewards. Total supply 200,000,000, deflationary via quarterly buyback-and-burn.', ARRAY['token','helix','tokenomics']),
  ('00000000-0000-0000-0000-000000000001','faq','How long do withdrawals take?','Withdrawal times depend on the blockchain. BTC ~30 min after block confirmation, ETH ~5 min, SOL ~1 min. Withdrawals are paused during network congestion for safety.', ARRAY['withdrawal','faq']),
  ('00000000-0000-0000-0000-000000000001','market_data','BTC dominance snapshot','As of the latest snapshot, BTC dominance sits near 52%. Always cite a timestamp and source; never present market data as current without one.', ARRAY['market','btc']),
  ('00000000-0000-0000-0000-000000000001','competitor','Competitor fee benchmark','Top-3 CEX average spot taker fee is ~0.12%. Position Helix as competitive at 0.10% / 0.075% with HELIX.', ARRAY['competitor','fees'])
on conflict do nothing;

insert into public.compliance_terms (org_id, term, category, severity, reason, replacement)
values
  ('00000000-0000-0000-0000-000000000001','guaranteed profit','banned','high','Promises returns — illegal in most jurisdictions.','Describe mechanics, not outcomes.'),
  ('00000000-0000-0000-0000-000000000001','risk-free','banned','high','No crypto product is risk-free.','State the risks explicitly.'),
  ('00000000-0000-0000-0000-000000000001','sure thing','banned','medium','Implies certainty of outcome.','Reframe as probabilistic.'),
  ('00000000-0000-0000-0000-000000000001','financial advice','banned','high','Platform is not a registered advisor.','Add: "for informational purposes only".'),
  ('00000000-0000-0000-0000-000000000001','to the moon','banned','low','Hype language, unprofessional.','Use neutral, data-based phrasing.'),
  ('00000000-0000-0000-0000-000000000001','risk disclaimer','required','high','All market/trading content must include the risk disclaimer.','Append the org risk disclaimer.')
on conflict do nothing;
