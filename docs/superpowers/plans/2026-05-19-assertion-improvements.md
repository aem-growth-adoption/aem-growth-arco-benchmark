# Assertion Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve benchmark assertion quality — fix a prompt/assertion contradiction, add weighted tiers to the recommender, fill in missing assertions for 9 empty tests, and tighten entity extraction in classification.

**Architecture:** Four YAML files edited in isolation. No new files. Each task is independently runnable: smoke-test with a single fast provider (`cloudflare/llama-4-scout-17b-instruct`) to confirm the assertion fires. The fast provider is:

```
label: cloudflare/llama-4-scout
```

Filter with: `npx promptfoo eval -c <config>.yaml --filter-providers "llama-4-scout" --no-cache --max-concurrency 1`

**Tech Stack:** promptfoo YAML config, JavaScript assertion expressions

---

## File Map

| File | What changes |
|------|-------------|
| `prompts/recommender.yaml:68` | Soften Rule 3 — comparison-table not required for support/technique |
| `recommender.yaml:291-350` | Replace 8 flat defaults with 8 weighted tiered defaults; add `threshold: 0.7` + per-test assertions to all 15 tests |
| `reasoning.yaml:377-445` | Add assertions + `threshold: 0.6` to 5 empty tests; verify follow-up assertion is already on all 15 |
| `classification.yaml:352-354` | Tighten studio/studio-pro entity extraction |

---

### Task 1: Fix Rule 3 in `prompts/recommender.yaml`

**Files:**
- Modify: `prompts/recommender.yaml:68`

- [ ] **Step 1: Edit Rule 3**

In `prompts/recommender.yaml`, line 68, replace:
```yaml
    3. **COMPARISON TABLE**: ALWAYS include at least one comparison-table block. Default to 3 products.
```
With:
```yaml
    3. **COMPARISON TABLE**: Include a comparison-table block in all product recommendation and comparison pages. Omit ONLY for pure support/troubleshooting queries and technique/how-to queries where no product comparison is relevant.
```

- [ ] **Step 2: Verify change looks correct**

Run:
```bash
sed -n '66,72p' prompts/recommender.yaml
```
Expected output should show the updated Rule 3 text.

- [ ] **Step 3: Commit**

```bash
git add prompts/recommender.yaml
git commit -m "fix: soften comparison-table rule 3 to allow omission for support/technique"
```

---

### Task 2: Replace recommender default assertions with weighted tiers

**Files:**
- Modify: `recommender.yaml:291-350` (the `defaultTest:` block)

The current `defaultTest.assert` block has 8 flat unweighted assertions. Replace the entire `assert:` section (lines ~294–350 in `recommender.yaml`) with the weighted version below. Keep the `options.transform` line unchanged.

- [ ] **Step 1: Replace the `defaultTest.assert` block**

In `recommender.yaml`, the `defaultTest:` section currently looks like:

```yaml
defaultTest:
  options:
    transform: '(output=>{...})(output)'
  assert:
    - type: javascript
      description: "output contains at least 2 === block separators (3+ blocks)"
      value: '(output.match(/===/g) || []).length >= 2'

    - type: javascript
      description: "first block is a hero block"
      value: '(s => { const first = s.split("===")[0].trim(); try { return JSON.parse(first).block === ''hero''; } catch(e) { return false; } })(output)'

    - type: javascript
      description: "output contains a comparison-table block (critical rule 3)"
      value: "output.includes('\"block\":\"comparison-table\"') || output.includes('\"block\": \"comparison-table\"')"

    - type: javascript
      description: "suggestions are present at the end"
      value: "output.includes('\"suggestions\"')"

    - type: javascript
      description: "no forbidden 'buy' suggestion type"
      value: '!/"type"\s*:\s*"buy"/.test(output)'

    - type: javascript
      description: "suggestion types are only explore or compare"
      value: |
        return (s => {
          const sugg = s.match(/"suggestions"\s*:\s*(\[[\s\S]*?\])/);
          if (!sugg) return true;
          const suggTypes = (sugg[1].match(/"type"\s*:\s*"([^"]+)"/g) || []).map(t => t.match(/"type"\s*:\s*"([^"]+)"/)[1]);
          return suggTypes.every(t => t === 'explore' || t === 'compare');
        })(output)

    - type: javascript
      description: "hero block contains an image token"
      value: |
        return (s => {
          const first = s.split("===")[0].trim();
          return first.includes('product-image:') || first.includes('hero-image:');
        })(output)

    - type: javascript
      description: "all product hrefs use real catalog paths (no invented URLs)"
      value: |
        return (s => {
          const hrefs = (s.match(/"href"\s*:\s*"([^"]+)"/g) || []).map(h => h.match(/"href"\s*:\s*"([^"]+)"/)[1]);
          const productHrefs = hrefs.filter(h => h.startsWith('/products/'));
          const validPrefixes = ['/products/espresso-machines/', '/products/grinders/'];
          return productHrefs.every(h => validPrefixes.some(p => h.startsWith(p)));
        })(output)
```

Replace it with:

```yaml
defaultTest:
  options:
    transform: '(output=>{const s=typeof output==="string"?output:output?.content??JSON.stringify(output);return s.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/^```(?:json)?\s*/m,"").replace(/\s*```\s*$/m,"").trim()})(output)'
  assert:
    # Tier 1 — Structural integrity (weight 3): page is fundamentally renderable
    - type: javascript
      description: "output has at least 2 === separators (3+ blocks)"
      value: '(output.match(/===/g) || []).length >= 2'
      weight: 3

    - type: javascript
      description: "first block is a hero"
      value: '(() => { try { return JSON.parse(output.split("===")[0].trim()).block === "hero"; } catch(e) { return false; } })()'
      weight: 3

    - type: javascript
      description: "hero block contains an image token"
      value: '(() => { const first = output.split("===")[0]; return first.includes("product-image:") || first.includes("hero-image:"); })()'
      weight: 3

    - type: javascript
      description: "suggestions present at the end"
      value: 'output.includes("\"suggestions\"")'
      weight: 3

    # Tier 2 — Rule compliance (weight 2): model follows prompt instructions
    - type: javascript
      description: "no forbidden buy suggestion type"
      value: '!/"type"\s*:\s*"buy"/.test(output)'
      weight: 2

    - type: javascript
      description: "suggestion types are only explore or compare"
      value: '(() => { const sugg = output.match(/"suggestions"\s*:\s*(\[[\s\S]*?\])/); if (!sugg) return true; const types = (sugg[1].match(/"type"\s*:\s*"([^"]+)"/g) || []).map(t => t.match(/"type"\s*:\s*"([^"]+)"/)[1]); return types.every(t => t === "explore" || t === "compare"); })()'
      weight: 2

    - type: javascript
      description: "all product hrefs use real catalog paths (no invented URLs)"
      value: '(() => { const hrefs = (output.match(/"href"\s*:\s*"([^"]+)"/g) || []).map(h => h.match(/"href"\s*:\s*"([^"]+)"/)[1]); return hrefs.filter(h => h.startsWith("/products/")).every(h => h.startsWith("/products/espresso-machines/") || h.startsWith("/products/grinders/")); })()'
      weight: 2

    # Tier 3 — Visual variety (weight 1)
    - type: javascript
      description: "at least 2 different block types used"
      value: '(() => { try { const blocks = output.split("===").slice(0,-1).map(s => JSON.parse(s.trim()).block); return new Set(blocks).size >= 2; } catch(e) { return false; } })()'
      weight: 1
```

- [ ] **Step 2: Verify the defaultTest block parses correctly**

Run:
```bash
npx promptfoo eval -c recommender.yaml --filter-providers "llama-4-scout" --filter-tests "cold-start" --no-cache --max-concurrency 1 --output /tmp/pf-rec-smoke.json 2>&1 | tail -20
```
Expected: run completes, shows score output (not a YAML parse error).

- [ ] **Step 3: Commit**

```bash
git add recommender.yaml
git commit -m "refactor: replace flat recommender defaults with weighted tier assertions"
```

---

### Task 3: Add `threshold: 0.7` and per-test assertions to all recommender tests

**Files:**
- Modify: `recommender.yaml` — all 15 test cases in the `tests:` section

Each test case gets `threshold: 0.7` added, plus scenario-specific assertions per the table below. Add them after the existing `assert:` block or create a new one if the test has none.

- [ ] **Step 1: Add threshold and assertions to all 15 tests**

Apply these changes to each test case. Add `threshold: 0.7` at the same indentation as `description:`. Add the listed assertions to each test's `assert:` block.

**cold-start** (already has 1 assertion — add threshold only):
```yaml
  - description: "cold-start: new visitor, no history"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "cold start uses hero-image:main (no specific product assumed)"
        value: "output.split('===')[0].includes('hero-image:main')"
        weight: 2
```

**beginner: switching from Nespresso** (already has 1 assertion — add weight + threshold):
```yaml
  - description: "beginner: switching from Nespresso"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "recommends a beginner-friendly machine (primo, nano, or automatico)"
        value: "/(primo|nano|automatico)/i.test(output)"
        weight: 2
```

**beginner: never made espresso before** (currently no assertions):
```yaml
  - description: "beginner: never made espresso before"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "recommends a beginner-friendly machine (primo, nano, viaggio, or automatico)"
        value: "/(primo|nano|viaggio|automatico)/i.test(output)"
        weight: 2
```

**comparison: primo vs doppio** (already has 1 assertion):
```yaml
  - description: "comparison: primo vs doppio"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "comparison-table block present"
        value: 'output.includes("\"block\":\"comparison-table\"") || output.includes("\"block\": \"comparison-table\"")'
        weight: 3
      - type: javascript
        description: "mentions both primo and doppio"
        value: "/primo/i.test(output) && /doppio/i.test(output)"
        weight: 2
```

**comparison: studio vs studio-pro** (already has 1 assertion):
```yaml
  - description: "comparison: studio vs studio-pro"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "comparison-table block present"
        value: 'output.includes("\"block\":\"comparison-table\"") || output.includes("\"block\": \"comparison-table\"")'
        weight: 3
      - type: javascript
        description: "mentions both studio models"
        value: "/studio/i.test(output)"
        weight: 2
```

**product-detail: ufficio deep-dive** (already has 1 assertion):
```yaml
  - description: "product-detail: ufficio deep-dive"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "comparison-table block present"
        value: 'output.includes("\"block\":\"comparison-table\"") || output.includes("\"block\": \"comparison-table\"")'
        weight: 2
      - type: javascript
        description: "mentions ufficio"
        value: "/ufficio/i.test(output)"
        weight: 2
```

**use-case: home office multiple users** (currently no assertions):
```yaml
  - description: "use-case: home office multiple users"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "recommends office-suited machine (ufficio or automatico)"
        value: "/(ufficio|automatico)/i.test(output)"
        weight: 2
```

**specs: studio pro boiler and pressure** (already has 1 assertion):
```yaml
  - description: "specs: studio pro boiler and pressure"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "mentions studio-pro"
        value: "/studio.pro|studio pro/i.test(output)"
        weight: 2
```

**reviews: nano customer opinions** (already has 1 assertion):
```yaml
  - description: "reviews: nano customer opinions"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "mentions nano"
        value: "/nano/i.test(output)"
        weight: 2
```

**price: student budget** (already has 1 assertion):
```yaml
  - description: "price: student budget"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "mentions the most affordable options (viaggio or nano)"
        value: "/(viaggio|nano)/i.test(output)"
        weight: 2
```

**recommendation: experienced barista** (already has 1 assertion):
```yaml
  - description: "recommendation: experienced barista"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "comparison-table block present"
        value: 'output.includes("\"block\":\"comparison-table\"") || output.includes("\"block\": \"comparison-table\"")'
        weight: 2
      - type: javascript
        description: "recommends a prosumer machine (studio or studio-pro)"
        value: "/studio/i.test(output)"
        weight: 2
```

**support: machine tripping circuit breaker** (already has 1 assertion):
```yaml
  - description: "support: machine tripping circuit breaker"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "mentions primo"
        value: "/primo/i.test(output)"
        weight: 2
```

**gift: birthday present for coffee lover** (currently no assertions):
```yaml
  - description: "gift: birthday present for coffee lover"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "recommends a gift-worthy machine (primo, doppio, or automatico)"
        value: "/(primo|doppio|automatico)/i.test(output)"
        weight: 2
```

**upgrade: from primo to next level** (already has 1 assertion):
```yaml
  - description: "upgrade: from primo to next level"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "comparison-table block present"
        value: 'output.includes("\"block\":\"comparison-table\"") || output.includes("\"block\": \"comparison-table\"")'
        weight: 2
      - type: javascript
        description: "recommends an upgrade over primo (doppio or studio)"
        value: "/(doppio|studio)/i.test(output)"
        weight: 2
```

**technique: milk steaming for latte art** (currently no assertions):
```yaml
  - description: "technique: milk steaming for latte art"
    threshold: 0.7
    vars:
      ...
    assert:
      - type: javascript
        description: "recommends a machine with a good steam wand (doppio, studio, or automatico)"
        value: "/(doppio|studio|automatico)/i.test(output)"
        weight: 2
```

- [ ] **Step 2: Smoke-test all 15 tests with one provider**

Run:
```bash
npx promptfoo eval -c recommender.yaml --filter-providers "llama-4-scout" --no-cache --max-concurrency 1 --output /tmp/pf-rec-all.json 2>&1 | tail -30
```
Expected: 15 tests run, no YAML parse errors, scores reported (not all need to pass, just verify no config errors).

- [ ] **Step 3: Commit**

```bash
git add recommender.yaml
git commit -m "feat: add threshold + weighted per-test assertions to all recommender tests"
```

---

### Task 4: Fill in assertions for 5 empty reasoning tests

**Files:**
- Modify: `reasoning.yaml` — 5 test cases currently missing `assert:` blocks

The 5 empty tests are at approximately these lines (verify with `grep -n "description:" reasoning.yaml`):
- `use-case: home office multiple users`
- `specs: studio pro boiler and pressure`
- `recommendation: experienced barista`
- `upgrade: from primo to next level`
- `technique: milk steaming for latte art`

The reasoning prompt guarantees `follow-up` is always the last block. All 5 tests also get `threshold: 0.6`.

- [ ] **Step 1: Add assertions + threshold to 5 empty tests**

**use-case: home office multiple users:**
```yaml
  - description: "use-case: home office multiple users"
    threshold: 0.6
    vars:
      query: "best machine for a busy home office with multiple users"
      comparisonHint: ""
    assert:
      - type: javascript
        description: "cards or product-list block present for multi-product use-case"
        value: "(() => { const t = JSON.parse(output).blocks.map(b => b.type); return t.includes('cards') || t.includes('product-list'); })()"
        weight: 2
      - type: javascript
        description: "follow-up is the last block"
        value: "(() => { const b = JSON.parse(output).blocks; return b[b.length - 1]?.type === 'follow-up'; })()"
        weight: 1
```

**specs: studio pro boiler and pressure:**
```yaml
  - description: "specs: studio pro boiler and pressure"
    threshold: 0.6
    vars:
      query: "what is the boiler size and pressure rating of the studio pro?"
      comparisonHint: ""
    assert:
      - type: javascript
        description: "table or product-detail block present for specs query"
        value: "(() => { const t = JSON.parse(output).blocks.map(b => b.type); return t.includes('table') || t.includes('product-detail'); })()"
        weight: 2
      - type: javascript
        description: "follow-up is the last block"
        value: "(() => { const b = JSON.parse(output).blocks; return b[b.length - 1]?.type === 'follow-up'; })()"
        weight: 1
```

**recommendation: experienced barista:**
```yaml
  - description: "recommendation: experienced barista"
    threshold: 0.6
    vars:
      query: "I'm an experienced barista who dials in single origin, what should I get?"
      comparisonHint: ""
    assert:
      - type: javascript
        description: "comparison-table block present for recommendation query"
        value: "JSON.parse(output).blocks.some(b => b.type === 'comparison-table')"
        weight: 2
      - type: javascript
        description: "follow-up is the last block"
        value: "(() => { const b = JSON.parse(output).blocks; return b[b.length - 1]?.type === 'follow-up'; })()"
        weight: 1
```

**upgrade: from primo to next level:**
```yaml
  - description: "upgrade: from primo to next level"
    threshold: 0.6
    vars:
      query: "I have the primo and want to upgrade, what should I consider?"
      comparisonHint: ""
    assert:
      - type: javascript
        description: "comparison-table block present for upgrade query (rule 8)"
        value: "JSON.parse(output).blocks.some(b => b.type === 'comparison-table')"
        weight: 2
      - type: javascript
        description: "follow-up is the last block"
        value: "(() => { const b = JSON.parse(output).blocks; return b[b.length - 1]?.type === 'follow-up'; })()"
        weight: 1
```

**technique: milk steaming for latte art:**
```yaml
  - description: "technique: milk steaming for latte art"
    threshold: 0.6
    vars:
      query: "how do I steam milk properly for latte art?"
      comparisonHint: ""
    assert:
      - type: javascript
        description: "video, cards, or accordion block present for technique query"
        value: "(() => { const t = JSON.parse(output).blocks.map(b => b.type); return t.includes('video') || t.includes('cards') || t.includes('accordion'); })()"
        weight: 2
      - type: javascript
        description: "follow-up is the last block"
        value: "(() => { const b = JSON.parse(output).blocks; return b[b.length - 1]?.type === 'follow-up'; })()"
        weight: 1
```

- [ ] **Step 2: Smoke-test the 5 previously empty tests**

Run:
```bash
npx promptfoo eval -c reasoning.yaml --filter-providers "llama-4-scout" --filter-tests "use-case|specs|recommendation|upgrade|technique" --no-cache --max-concurrency 1 --output /tmp/pf-reason-smoke.json 2>&1 | tail -20
```
Expected: 5 tests run with assertion results (scores shown, no parse errors).

- [ ] **Step 3: Commit**

```bash
git add reasoning.yaml
git commit -m "feat: add assertions to 5 empty reasoning tests"
```

---

### Task 5: Tighten studio/studio-pro entity extraction in classification

**Files:**
- Modify: `classification.yaml:352-354`

The current assertion for "comparison: studio vs studio-pro" only checks `x.includes('studio')` which matches even when the model only extracts `studio` and misses `studio-pro`.

- [ ] **Step 1: Replace the loose assertion**

Find this in `classification.yaml`:
```yaml
  - description: "comparison: studio vs studio-pro"
    vars:
      query: "what's the difference between the studio and studio-pro?"
    assert:
      - type: javascript
        description: "intent = comparison"
        value: "JSON.parse(output).intentType === 'comparison'"
      - type: javascript
        description: "extracts studio models as entities"
        value: "(JSON.parse(output).entities?.products || []).some(x => x.includes('studio'))"
```

Replace with:
```yaml
  - description: "comparison: studio vs studio-pro"
    vars:
      query: "what's the difference between the studio and studio-pro?"
    assert:
      - type: javascript
        description: "intent = comparison"
        value: "JSON.parse(output).intentType === 'comparison'"
      - type: javascript
        description: "extracts both studio and studio-pro as entities"
        value: "(() => { const p = JSON.parse(output).entities?.products || []; const hasStudio = p.some(x => (x === 'studio' || x.includes('studio')) && !x.includes('pro')); const hasStudioPro = p.some(x => x.includes('studio-pro') || x.includes('studio pro')); return hasStudio && hasStudioPro; })()"
```

- [ ] **Step 2: Smoke-test this test case**

Run:
```bash
npx promptfoo eval -c classification.yaml --filter-providers "llama-4-scout" --filter-tests "studio vs studio" --no-cache --max-concurrency 1 --output /tmp/pf-class-smoke.json 2>&1 | tail -20
```
Expected: 1 test runs, assertion fires (pass or fail depending on the model — that's fine, just verify no JS errors).

- [ ] **Step 3: Commit**

```bash
git add classification.yaml
git commit -m "fix: tighten studio/studio-pro entity extraction to require both entities"
```

---

## Final verification

After all 5 tasks, do a full single-provider run across all three suites to confirm no YAML or assertion errors:

```bash
npx promptfoo eval -c classification.yaml --filter-providers "llama-4-scout" --no-cache --max-concurrency 2 --output /tmp/pf-class-final.json 2>&1 | tail -5
npx promptfoo eval -c reasoning.yaml --filter-providers "llama-4-scout" --no-cache --max-concurrency 2 --output /tmp/pf-reason-final.json 2>&1 | tail -5
npx promptfoo eval -c recommender.yaml --filter-providers "llama-4-scout" --no-cache --max-concurrency 1 --output /tmp/pf-rec-final.json 2>&1 | tail -5
```

Expected: all three complete with no parse errors, results reported.
