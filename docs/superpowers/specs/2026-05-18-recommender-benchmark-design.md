# Recommender Benchmark Design

**Date:** 2026-05-18
**Status:** Implemented

## Summary

A new promptfoo benchmark suite (`recommender.yaml`) that tests the single-LLM-call recommender prompt from `../arco/workers/recommender/src/recommender-prompt.js` across all 32 providers already used by the classification and reasoning suites.

## Context

The existing benchmark has two suites:
- `classification.yaml` — tests a two-step intent classification prompt (output: single JSON object)
- `reasoning.yaml` — tests a block-selection prompt (output: single JSON object with `blocks` array)

The new Arco recommender uses a **single LLM call** that outputs a full page as `===`-separated JSON block objects (EDS block format), not a single JSON envelope. The output format, prompt size, and assertion strategy are all fundamentally different.

## Architecture

### Files Created

| File | Purpose |
|------|---------|
| `recommender.yaml` | Promptfoo config — 32 providers, 15 test cases, assertions |
| `prompts/recommender.yaml` | Prompt template — baked-in system prompt + user message template |
| `results/recommender.json` | Merged results output (same pattern as classification/reasoning) |

### npm Scripts

```bash
npm run eval:recommender        # run recommender benchmark
npm run eval:fresh              # now includes recommender
```

## Prompt Strategy

**System message:** The full `buildRecommenderSystemPrompt()` output baked in as a static YAML literal block (~38KB). Contains: brand voice, critical rules, EDS block guide, page structure scenarios, and the complete product catalog (14 products, accessories).

**User message template:** Assembles the cold-start/comparison user message with template variables injected per test case:
- `{{query}}` — the user query
- `{{scenario_prefix}}` — preamble matching the scenario type (cold-start, comparison, profile, etc.)
- `{{rag_products}}` — 2-3 hardcoded products relevant to the query
- `{{rag_guides}}` — article stubs (empty for most tests; populated for review tests)
- `{{rag_reviews}}` — review stubs (populated for review-focused tests)
- `{{intent_type}}` — pre-classified intent type

## Output Format

Unlike classification/reasoning, the output is **not** a single JSON object. It is:

```
{"block":"hero","rows":[[...]]}
===
{"block":"columns","rows":[[...]]}
===
{"block":"comparison-table","rows":[[...]],"data":{"recommended":"Primo"}}
===
{"suggestions":[{"type":"explore","label":"Best for milk drinks?","query":"..."}]}
```

The transform strips `<think>` tags (for reasoning models) and returns the raw text for assertion evaluation.

## Assertions

### Default (every test)

| Assertion | What it checks |
|-----------|---------------|
| `≥2 === separators` | At least 3 blocks produced |
| `first block is hero` | Page always starts with hero |
| `comparison-table present` | Critical rule 3 always enforced |
| `suggestions present` | Page always ends with follow-up suggestions |
| `no "buy" type` | Critical rule 1 — no sales push |
| `suggestion types only explore/compare` | Validates suggestion type constraint |
| `hero contains image token` | Hero always has product-image or hero-image token |
| `product hrefs use catalog paths` | No invented URLs |

### Per-test

Each test case adds intent-specific checks (e.g., correct product mentioned, correct scenario template used for cold-start).

## Test Cases

15 test cases mirroring the classification and reasoning suites:

| # | Description | Intent | RAG stub |
|---|-------------|--------|----------|
| 1 | Cold-start discovery | product-discovery | none |
| 2 | Beginner: Nespresso switcher | beginner | primo, nano, automatico |
| 3 | Beginner: never made espresso | beginner | primo, nano, viaggio |
| 4 | Comparison: primo vs doppio | comparison | primo, doppio |
| 5 | Comparison: studio vs studio-pro | comparison | studio, studio-pro |
| 6 | Product detail: ufficio | product-detail | ufficio, studio-pro, studio |
| 7 | Use case: home office | espresso | ufficio, automatico, doppio |
| 8 | Specs: studio pro boiler | espresso | studio-pro, studio, doppio |
| 9 | Reviews: nano opinions | espresso | nano, primo + 2 review stubs |
| 10 | Price: student budget | budget | viaggio, nano, primo |
| 11 | Recommendation: expert barista | espresso | studio-pro, studio, macinino-pro |
| 12 | Support: circuit breaker | support | primo |
| 13 | Gift: birthday present | gift | primo, doppio, automatico |
| 14 | Upgrade: from primo | upgrade | doppio, studio, macinino |
| 15 | Technique: milk steaming | milk-drinks | doppio, studio, primo |

## Concurrency

`--max-concurrency 5` (vs 10 for classification/reasoning) — the recommender prompt is ~38KB system + variable user, so token usage per call is much higher. Lower concurrency avoids rate-limit thrashing across providers.

## Running

```bash
# Recommender only
npm run eval:recommender

# Skip Vertex (no gcloud token)
npx promptfoo eval -c recommender.yaml --filter-providers "cerebras|cloudflare|bedrock|k8s" --max-concurrency 5
```
