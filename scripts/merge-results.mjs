#!/usr/bin/env node
/**
 * Merge a new promptfoo results file into an existing one.
 * Providers present in <new> replace their counterparts in <existing>.
 * All other providers in <existing> are preserved.
 *
 * Usage: node scripts/merge-results.mjs <existing.json> <new.json>
 * The merged result is written back to <existing.json>.
 */

import { readFileSync, writeFileSync } from 'fs';

const [, , existingPath, newPath] = process.argv;
if (!existingPath || !newPath) {
  console.error('Usage: merge-results.mjs <existing.json> <new.json>');
  process.exit(1);
}

const incoming = JSON.parse(readFileSync(newPath, 'utf8'));

let base;
try {
  base = JSON.parse(readFileSync(existingPath, 'utf8'));
} catch {
  // No existing file — just copy the new one in
  writeFileSync(existingPath, JSON.stringify(incoming, null, 2));
  console.log(`Created ${existingPath} (no prior file)`);
  process.exit(0);
}

// Provider IDs being replaced (use provider.id for exact matching)
const incomingProviderIds = new Set(
  incoming.results.results.map((r) => r.provider.id),
);

// Keep results for providers NOT in the incoming run, add all incoming results
const retained = base.results.results.filter(
  (r) => !incomingProviderIds.has(r.provider.id),
);
const merged = [...retained, ...incoming.results.results];

// Recompute stats from merged rows
const successes = merged.filter((r) => r.success).length;
const failures  = merged.filter((r) => !r.success && !r.error).length;
const errors    = merged.filter((r) => !!r.error).length;

const mergedStats = {
  ...incoming.results.stats,
  successes,
  failures,
  errors,
};

const output = {
  ...base,
  evalId: incoming.evalId,
  results: {
    ...base.results,
    timestamp: incoming.results.timestamp,
    results: merged,
    stats: mergedStats,
  },
};

writeFileSync(existingPath, JSON.stringify(output, null, 2));

const retained_count = incomingProviderIds.size;
const kept_count = new Set(retained.map((r) => r.provider.id)).size;
console.log(
  `Merged ${retained_count} updated provider(s) into ${existingPath} ` +
  `(kept ${kept_count} existing, total ${merged.length} results)`,
);
