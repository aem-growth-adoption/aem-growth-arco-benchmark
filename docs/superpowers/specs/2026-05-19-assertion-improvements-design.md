# Assertion Improvements Design

## Goal

Improve the benchmark's test assertions so that model comparison is genuinely meaningful: replace trivial or incorrect checks with weighted, multi-dimensional assertions that give partial credit, surface real layout quality differences, and eliminate assertions that contradict the prompts.

## Architecture

Three suites are affected differently:

- **Classification** — keep strict pass/fail. The output is structured JSON with a single `intentType` field. Pass/fail is the right signal.
- **Reasoning** — add missing assertions to 5 empty tests, add `follow-up` last-block check to all tests. Use `threshold: 0.6` on tests where multiple valid block combinations exist.
- **Recommender** — restructure into weighted tiers, fix the `comparison-table` contradiction, move scenario-specific layout assertions into per-test `assert` blocks, add `threshold: 0.7` on all tests.

---

## Section 1: Fix the comparison-table contradiction in recommender

### Problem

`prompts/recommender.yaml` Rule 3 says "ALWAYS include at least one comparison-table block." But the Support scenario structure (`hero + text + accordion`) has no comparison-table, and the Technique scenario (`hero + text (hobby tips) + columns + comparison-table`) only conditionally includes one.

The current `recommender.yaml` fires a `comparison-table` global default assertion on every test — including support and technique — causing false failures.

### Fix

**Step 1 — Update `prompts/recommender.yaml` Rule 3:**

Change:
```
3. **COMPARISON TABLE**: ALWAYS include at least one comparison-table block. Default to 3 products.
```
To:
```
3. **COMPARISON TABLE**: Include a comparison-table block in all product recommendation and comparison pages. Omit ONLY for pure support/troubleshooting queries and technique/how-to queries where no product comparison is relevant.
```

**Step 2 — Remove `comparison-table` from the global default assertions in `recommender.yaml`.** Add it explicitly per test case (see Section 3).

---

## Section 2: Weighted assertion tiers for the recommender

Replace the current 8 flat default assertions with three tiers applied at the `defaultTest` level using `weight`. Tests that have scenario-specific assertions (Section 3) supplement these defaults.

### Tier 1 — Structural integrity (weight: 3)
Page is fundamentally renderable. Failures here mean the output is broken.

```yaml
- type: javascript
  description: "output has at least 2 === separators (3+ blocks)"
  value: "(output.match(/===/g) || []).length >= 2"
  weight: 3

- type: javascript
  description: "first block is a hero"
  value: >
    (() => { try { return JSON.parse(output.split('===')[0].trim()).block === 'hero'; } catch(e) { return false; } })()
  weight: 3

- type: javascript
  description: "hero block contains an image token"
  value: "output.split('===')[0].includes('hero-image:') || output.split('===')[0].includes('product-image:')"
  weight: 3

- type: javascript
  description: "suggestions present at the end"
  value: >
    (() => { try { const last = output.split('===').pop().trim(); return JSON.parse(last).suggestions !== undefined; } catch(e) { return false; } })()
  weight: 3
```

### Tier 2 — Rule compliance (weight: 2)
Critical business rules. Failures indicate the model is ignoring explicit prompt instructions.

```yaml
- type: javascript
  description: "no forbidden buy suggestion type"
  value: "!output.includes('\"type\":\"buy\"')"
  weight: 2

- type: javascript
  description: "suggestion types are only explore or compare"
  value: >
    (() => { try { const last = JSON.parse(output.split('===').pop().trim()); return last.suggestions.every(s => s.type === 'explore' || s.type === 'compare'); } catch(e) { return false; } })()
  weight: 2

- type: javascript
  description: "all product hrefs use real catalog paths (no invented URLs)"
  value: >
    (() => { const hrefs = [...output.matchAll(/"href"\s*:\s*"([^"]+)"/g)].map(m => m[1]); return hrefs.every(h => h.startsWith('/products/') || h.startsWith('/experiences/') || h.startsWith('/stories/')); })()
  weight: 2
```

### Tier 3 — Visual variety (weight: 1)
Nice-to-have. Multiple block types means a visually varied page.

```yaml
- type: javascript
  description: "at least 2 different block types used"
  value: >
    (() => { try { const blocks = output.split('===').slice(0,-1).map(s => JSON.parse(s.trim()).block); return new Set(blocks).size >= 2; } catch(e) { return false; } })()
  weight: 1
```

**Total possible weight: 3+3+3+3+2+2+2+1 = 19**

All tests get `threshold: 0.7` — a model must score at least 70% of weighted assertions to pass.

---

## Section 3: Per-test scenario assertions

These are added directly to the `assert` block of each test case and supplement the defaults above.

### Recommender tests

| Test | Assertion | Weight |
|------|-----------|--------|
| cold-start | `hero-image:main` in first block | 2 |
| beginner: switching from Nespresso | `/(primo\|nano\|automatico)/i` | 2 |
| beginner: never made espresso | `/(primo\|nano\|viaggio\|automatico)/i` | 2 |
| comparison: primo vs doppio | `comparison-table` block present | 3 |
| comparison: primo vs doppio | mentions both primo and doppio | 2 |
| comparison: studio vs studio-pro | `comparison-table` block present | 3 |
| comparison: studio vs studio-pro | mentions both studio models | 2 |
| product-detail: ufficio | `comparison-table` block present | 2 |
| product-detail: ufficio | mentions ufficio | 2 |
| use-case: home office | `/(ufficio\|automatico)/i` | 2 |
| specs: studio-pro | mentions studio-pro | 2 |
| reviews: nano | mentions nano | 2 |
| price: student budget | `/(viaggio\|nano)/i` | 2 |
| recommendation: experienced barista | `comparison-table` block present | 2 |
| recommendation: experienced barista | `/studio/i` | 2 |
| support: circuit breaker | mentions primo | 2 |
| gift: birthday present | `/(primo\|doppio\|automatico)/i` | 2 |
| upgrade: from primo | `comparison-table` block present | 2 |
| upgrade: from primo | `/(doppio\|studio)/i` | 2 |
| technique: milk steaming | `/(doppio\|studio\|automatico)/i` | 2 |

### Reasoning tests (5 previously empty)

| Test | Assertion | Weight |
|------|-----------|--------|
| use-case: home office | `cards` or `product-list` block present | 2 |
| specs: studio-pro | `table` or `product-detail` block present | 2 |
| recommendation: experienced barista | `comparison-table` block present | 2 |
| upgrade: from primo | `comparison-table` block present | 2 |
| technique: milk steaming | `video`, `cards`, or `accordion` block present | 2 |

All reasoning tests also get the universal assertion (already present on most but missing from these 5):
```yaml
- type: javascript
  description: "follow-up is the last block"
  value: "JSON.parse(output).blocks.at(-1)?.type === 'follow-up'"
  weight: 1
```

Reasoning tests use `threshold: 0.6` to allow for valid block variation (e.g. technique could use `video` OR `cards`).

---

## Section 4: Classification — no changes to pass/fail, minor entity extraction tightening

Two comparison tests have loose entity extraction:

- "comparison: studio vs studio-pro" currently passes with just `x.includes('studio')` — matches only `studio` even when `studio-pro` is not extracted.

Fix: require both `studio` and `studio-pro` explicitly:
```javascript
(() => {
  const p = JSON.parse(output).entities?.products || [];
  return p.some(x => x === 'studio' || x.includes('studio') && !x.includes('pro')) &&
         p.some(x => x.includes('studio-pro') || x.includes('studio pro'));
})()
```

---

## Files Changed

| File | Change |
|------|--------|
| `prompts/recommender.yaml` | Soften Rule 3 (comparison-table not required for support/technique) |
| `recommender.yaml` | Replace 8 flat defaults with 8 weighted tiered defaults; add per-test assertions; add `threshold: 0.7` to all tests |
| `reasoning.yaml` | Add assertions + `threshold: 0.6` to 5 empty tests; add `follow-up` last-block assertion to all 15 tests |
| `classification.yaml` | Tighten studio/studio-pro entity extraction assertion |

---

## Non-goals

- No judge LLM (`llm-rubric`) in this iteration. All assertions remain deterministic JS.
- No new test cases added — only existing tests improved.
- No changes to provider list or prompt content beyond Rule 3 wording.
