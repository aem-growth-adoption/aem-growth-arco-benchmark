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

Copy `.env.example` to `.env` and fill in your credentials, then from this directory:

```bash
# Classification benchmark
npx promptfoo@latest eval -c classification.yaml --output results/classification.json

# Reasoning benchmark
npx promptfoo@latest eval -c reasoning.yaml --output results/reasoning.json

# Run without GEMINI_API_KEY override (required for Vertex AI OAuth)
env -u GEMINI_API_KEY npx promptfoo@latest eval -c classification.yaml

# Llama 4 MaaS requires a fresh GCLOUD_TOKEN; refresh before running:
GCLOUD_TOKEN=$(gcloud auth print-access-token) npx promptfoo@latest eval ...
```

**Provider notes:**
- `vertex:` providers read `VERTEX_PROJECT_ID` and `VERTEX_REGION` (not `GCP_PROJECT_ID`/`GCP_LOCATION`)
- `GEMINI_API_KEY` in the shell overrides Vertex OAuth mode — unset it with `env -u GEMINI_API_KEY`
- Llama 4 MaaS tokens expire hourly; run them separately to avoid aborting the whole eval

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

Results are published to GitHub Pages at `https://carlossg.github.io/arco/benchmark/` after each push to `main` in the `arco` repo.

To preview locally:

```bash
npx serve .
# open http://localhost:3000
```
