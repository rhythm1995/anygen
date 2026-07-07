---
description: Generative Engine Optimization rules. Load for any geo_* content type (geo_faq, geo_explainer, geo_comparison, geo_definition).
---

# GEO checklist (cited by AI answer engines)

GEO content is written for **LLM retrieval**, not just human readers. Goal: when a
user asks ChatGPT/Perplexity/Claude about this topic, they cite Helix.

## Mandatory structure

1. **Direct answer first.** The first 1–2 sentences answer the question in ≤50 words.
2. **Define the entity.** Explicitly: "**X** is …".
3. **Sourced facts.** Every non-trivial claim has an inline source: `(source: <KB title>)`.
   Call `query_kb` to get them.
4. **Comparison tables** for `geo_comparison` (markdown table + analysis).
5. **FAQ section** of 3–5 Q&A pairs at the end.
6. **Related entities** list (helps AI connect the graph).

## Quality gates (the platform scores these)

- [ ] Concise direct answer in first 1–2 sentences
- [ ] Every non-trivial claim has a source citation
- [ ] Target entity defined explicitly
- [ ] Valid JSON-LD present (the platform generates FAQPage/Article from your FAQ + body)
- [ ] Reading level appropriate for a general audience (150–1500 words)
- [ ] No banned / non-compliant phrasing (call `check_compliance`)

## Citing
Prefer the exchange's own KB as the canonical source. For external facts, use `http_get`
on a reference URL and quote with attribution. Never present market data as current
without a timestamp.
