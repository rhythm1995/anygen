---
description: Crypto compliance guardrails. Load for market, trading, listing, or token content.
---

# Compliance guardrails

Crypto content is regulated. These rules are non-negotiable.

## Banned (never use)
- "guaranteed profit", "risk-free", "sure thing", "can't lose", "to the moon"
- "financial advice" (we are not a registered advisor)
- Any promise or implication of returns

## Required (must include)
- **Risk disclaimer** on every market / trading / listing / token piece. Use the
  org's canonical disclaimer from the brand profile verbatim.
- **"Informational purposes only"** phrasing where giving context on assets.

## Restricted (use with care)
- Specific ROI / APY numbers — only if sourced from KB, with conditions stated.
- Regional claims — scope to the brand's `target_markets` (e.g. "exclude-US").

## Process
Before finalizing, call `check_compliance` on the full draft. Fix every `banned`
hit (reword) and every missing `required` (add the disclaimer). Do not return a
draft with open blocking issues.
