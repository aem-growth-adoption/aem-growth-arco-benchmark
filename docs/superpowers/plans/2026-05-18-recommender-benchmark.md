# Recommender Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and commit the new `recommender.yaml` promptfoo benchmark suite that tests the single-LLM-call Arco recommender prompt across 32 providers.

**Architecture:** All files are already written. This plan runs a smoke test against one cheap/fast provider to confirm the prompt template, transform, and assertions work correctly before committing. Any issues found are fixed inline before the final commit.

**Tech Stack:** promptfoo (npx), Node.js, YAML, bash

---

## Files

| Status | File | Purpose |
|--------|------|---------|
| Created | `recommender.yaml` | Promptfoo config — 32 providers, 15 tests, 8 default assertions |
| Created | `prompts/recommender.yaml` | Prompt — baked-in 38KB system prompt + user message template |
| Created | `results/recommender.json` | Empty seed for merge-results.mjs |
| Created | `docs/superpowers/specs/2026-05-18-recommender-benchmark-design.md` | Design doc |
| Created | `docs/superpowers/plans/2026-05-18-recommender-benchmark.md` | This file |
| Modified | `package.json` | Added `eval:recommender` and updated `eval:fresh` |

---

### Task 1: Smoke-test against one provider

**Files:**
- Read: `recommender.yaml`
- Read: `prompts/recommender.yaml`

Run a single test case against one fast, cheap provider to confirm:
1. promptfoo can parse `recommender.yaml` without errors
2. The prompt template variables render correctly
3. The transform fires without errors
4. The assertions evaluate (pass or fail — we just need them to run)

- [ ] **Step 1: Run smoke test (1 test, 1 provider)**

```bash
npx promptfoo eval -c recommender.yaml \
  --filter-providers "cloudflare/llama-4-scout-17b" \
  --filter-pattern "cold-start" \
  --max-concurrency 1 \
  --no-cache \
  --output /tmp/pf-smoke.json 2>&1 | tail -40
```

Expected: promptfoo starts, sends the request, and prints a results table. It should NOT print YAML parse errors or `undefined` template variable warnings.

- [ ] **Step 2: Inspect the raw output**

```bash
node -e "
const r = require('/tmp/pf-smoke.json');
const result = r.results?.results?.[0];
if (!result) { console.log('No results'); process.exit(1); }
console.log('Provider:', result.provider?.label || result.provider?.id);
console.log('Pass:', result.success);
console.log('Output (first 500 chars):');
console.log((result.response?.output || '').substring(0, 500));
console.log('---');
console.log('Assertion results:');
(result.gradingResult?.componentResults || []).forEach(c => {
  console.log(' ', c.pass ? '✓' : '✗', c.reason || c.assertion?.description || '');
});
"
```

Expected: Output should start with `{\"block\":\"hero\"` and contain `===` separators. All assertions should show either ✓ (pass) or ✗ with a meaningful reason (not a JS error).

- [ ] **Step 3: Check for template variable rendering issues**

```bash
node -e "
const r = require('/tmp/pf-smoke.json');
const prompt = r.results?.results?.[0]?.prompt?.raw || '';
console.log('Prompt contains {{query}}:', prompt.includes('{{query}}'));
console.log('Prompt contains {{scenario_prefix}}:', prompt.includes('{{scenario_prefix}}'));
console.log('--- User message start (last 300 chars of prompt) ---');
console.log(prompt.slice(-300));
"
```

Expected: `false` for both `includes` checks (variables should be substituted). The user message end should show the rendered query and scenario text, not raw `{{query}}` tokens.

---

### Task 2: Fix issues (if any found in Task 1)

**Files:**
- Modify: `recommender.yaml` (if assertion JS has errors)
- Modify: `prompts/recommender.yaml` (if template vars don't render)

This task only applies if Task 1 reveals problems. Common issues and fixes:

**Issue A: JS assertion throws ReferenceError**

If an assertion like `(output.match(...) || []).length >= 2` throws because `output` is undefined after the transform, the transform is not returning a string. Fix:

In `recommender.yaml`, update the transform value to ensure it always returns a string:

```yaml
transform: '(output=>{const s=typeof output==="string"?output:(output?.content??JSON.stringify(output)??"");return s.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/^```(?:json)?\s*/m,"").replace(/\s*```\s*$/m,"").trim()})(output)'
```

**Issue B: Template variable `{{scenario_prefix}}` renders as literal text in the prompt**

This happens if promptfoo doesn't interpolate YAML block scalar vars that contain newlines. Fix by converting `scenario_prefix` to a single-line value in `recommender.yaml`:

Change the cold-start test's `scenario_prefix` from a block scalar to a quoted string:
```yaml
scenario_prefix: "New visitor with no browsing history. Generate a discovery page. Use {{hero-image:main}}."
```

Apply the same change to all 15 test cases.

**Issue C: Hero assertion fails because first block is not hero**

Some models may wrap output in extra text before the first `{`. Check if the transform needs to strip leading prose:

```yaml
transform: '(output=>{let s=typeof output==="string"?output:(output?.content??JSON.stringify(output)??"");s=s.replace(/<think>[\s\S]*?<\/think>/g,"");const i=s.indexOf("{\"block\"");return i>=0?s.slice(i).replace(/^```(?:json)?\s*/m,"").replace(/\s*```\s*$/m,"").trim():s.trim()})(output)'
```

- [ ] **Step 1: Apply relevant fixes based on Task 1 findings**

Only apply the fixes that match the actual errors observed. If Task 1 passed cleanly, skip this task entirely.

- [ ] **Step 2: Re-run smoke test to confirm fixes work**

```bash
npx promptfoo eval -c recommender.yaml \
  --filter-providers "cloudflare/llama-4-scout-17b" \
  --filter-pattern "cold-start" \
  --max-concurrency 1 \
  --no-cache \
  --output /tmp/pf-smoke2.json 2>&1 | tail -20
```

Expected: No JS errors in assertion output. Assertions either pass or fail with readable messages.

---

### Task 3: Commit all new files

**Files:**
- Commit: `recommender.yaml`, `prompts/recommender.yaml`, `results/recommender.json`, `package.json`, `docs/superpowers/specs/2026-05-18-recommender-benchmark-design.md`, `docs/superpowers/plans/2026-05-18-recommender-benchmark.md`

- [ ] **Step 1: Verify git status**

```bash
git status
```

Expected output includes:
```
new file:   recommender.yaml
new file:   prompts/recommender.yaml
new file:   results/recommender.json
modified:   package.json
new file:   docs/superpowers/specs/2026-05-18-recommender-benchmark-design.md
new file:   docs/superpowers/plans/2026-05-18-recommender-benchmark.md
```

- [ ] **Step 2: Stage and commit**

```bash
git add recommender.yaml prompts/recommender.yaml results/recommender.json package.json docs/superpowers/specs/2026-05-18-recommender-benchmark-design.md docs/superpowers/plans/2026-05-18-recommender-benchmark.md
git commit -m "$(cat <<'EOF'
feat: add recommender benchmark (single-LLM-call, EDS block output)

Tests the new single-call recommender prompt from ../arco across all 32
providers. Prompt is baked in with full product catalog (~38KB system
prompt). Assertions verify hero-first structure, comparison-table
presence, no buy-type suggestions, and valid product URL paths.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit hash printed, no hook failures.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|------------|
| Baked-in product catalog | `prompts/recommender.yaml` — system prompt rendered from arco JSON |
| 32 providers (same as other suites) | `recommender.yaml` providers list |
| 15 mirrored test cases | `recommender.yaml` tests section |
| RAG stubs per test (Option B) | Per-test `rag_products` vars |
| `===`-separated output format | Transform + assertions |
| `eval:recommender` npm script | `package.json` |
| `--max-concurrency 5` (lower for large prompts) | `recommender.yaml` script |
| Hero-first assertion | Default assert #2 |
| comparison-table always present | Default assert #3 |
| No buy suggestions | Default assert #5 + #6 |
| Valid product URLs | Default assert #8 |

**Gaps:** None found.

**Placeholder scan:** No TBDs, TODOs, or incomplete steps. Issue B fix code is complete and directly applicable. All commands are exact and runnable.

**Type consistency:** No shared types between tasks — each task is independent bash/YAML/JS.
