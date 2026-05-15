# arco-benchmark

PromptFoo benchmarks and Cloudflare Worker for the [Arco](https://github.com/carlossg/arco) demo site.

## Structure

```
├── classification.yaml        # PromptFoo eval — intent classification
├── reasoning.yaml             # PromptFoo eval — block reasoning/selection
├── prompts/
│   ├── classification.yaml    # System + user prompt for classification
│   └── reasoning.yaml         # System + user prompt for reasoning
├── results/
│   ├── classification.json    # Latest classification benchmark results
│   └── reasoning.json         # Latest reasoning benchmark results
├── worker/                    # Cloudflare Worker for latency benchmarking
│   ├── src/
│   │   ├── index.ts           # Worker entry point (HTTP + cron trigger)
│   │   ├── runner.ts          # Benchmark runner logic
│   │   ├── prompts.ts         # Shared prompt text
│   │   ├── auth/              # SigV4 (AWS) and Vertex JWT helpers
│   │   └── providers/         # Per-provider API clients
│   └── wrangler.toml          # Cloudflare Worker config
└── index.html                 # Benchmark report viewer (served via GitHub Pages)
```

## Running Benchmarks (PromptFoo)

Copy `.env.example` to `.env` and fill in your credentials, then install dependencies and run:

```bash
npm install
```

| Command | Description |
|---------|-------------|
| `npm run eval:classification` | Run classification benchmark (all providers, cached) |
| `npm run eval:reasoning` | Run reasoning benchmark (all providers, cached) |
| `npm run eval:fresh` | Run both benchmarks without cache (forces fresh API calls) |
| `npm run view` | Open the PromptFoo UI to browse results |

Results are merged into `results/classification.json` and `results/reasoning.json` after each run.

**Provider notes:**
- `vertex:` providers read `VERTEX_PROJECT_ID` and `VERTEX_REGION` (not `GCP_PROJECT_ID`/`GCP_LOCATION`)
- `GEMINI_API_KEY` in the shell overrides Vertex OAuth mode — the eval scripts unset it automatically
- Llama 4 MaaS tokens expire hourly; the scripts auto-refresh via `gcloud auth print-access-token` — ensure `gcloud` is authenticated

## Cloudflare Worker

The `worker/` directory contains a Cloudflare Worker that runs the same classification and reasoning benchmarks directly from the edge (no local Node.js needed). It supports:

- **HTTP trigger** — `GET /run?providers=vertex,bedrock` to run on demand
- **Cron trigger** — scheduled weekly (Monday 6am UTC) via `wrangler.toml`
- Results stored in KV and R2

```bash
cd worker
npm install
wrangler dev     # local dev
wrangler deploy  # deploy to Cloudflare
```

Set secrets before deploying:

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put GCP_SERVICE_ACCOUNT_JSON   # base64-encoded service account JSON
wrangler secret put CEREBRAS_API_KEY
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

## Benchmark Report

[Results are published to GitHub Pages](https://solid-bassoon-mvjk2mp.pages.github.io/) after each push to `main`.

To preview locally:

```bash
npx serve .
# open http://localhost:3000
```
