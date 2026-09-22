# @lesetong/pi-mimo

Pi extension for Xiaomi MiMo AI models. Auto-discovers and registers all available models from the MiMo API.

Supports **multiple regions** (CN / SGP / AMS) and **both OpenAI-compatible and Anthropic-compatible protocols**.

## Install

### Via npm

```bash
pi install npm:@lesetong/pi-mimo
```

### Via git (GitHub)

```bash
pi install git:github.com/leset0ng/pi-mimo
```

## Setup

### Option 1: /login (easiest)

Inside pi, run `/login mimo`, pick **Xiaomi MiMo**, and paste your API key. pi stores it in `~/.pi/agent/auth.json` and uses it automatically.

### Option 2: Environment variables

```bash
export MIMO_API_KEY="tp-xxxxx"
# Optional: choose region and protocol
export MIMO_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1"
export MIMO_API="openai-completions"   # or "anthropic-messages"
```

### Option 3: pi auth.json

Store everything in `~/.pi/agent/auth.json` — no env vars needed:

```json
{
  "mimo": {
    "type": "api_key",
    "key": "tp-xxxxx",
    "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
    "api": "openai-completions"
  }
}
```

Or append with one command:

```bash
cat <<'EOF' >> ~/.pi/agent/auth.json
, "mimo": { "type": "api_key", "key": "tp-xxxxx", "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1", "api": "openai-completions" }
EOF
```

> **Note:** Make sure the resulting JSON is valid (no duplicate keys, proper commas).

## Region & Protocol Matrix

| Region | OpenAI-compatible | Anthropic-compatible |
|--------|-------------------|----------------------|
| China (CN) | `https://token-plan-cn.xiaomimimo.com/v1` | `https://token-plan-cn.xiaomimimo.com/anthropic` |
| Singapore (SGP) | `https://token-plan-sgp.xiaomimimo.com/v1` | `https://token-plan-sgp.xiaomimimo.com/anthropic` |
| Europe (AMS) | `https://token-plan-ams.xiaomimimo.com/v1` | `https://token-plan-ams.xiaomimimo.com/anthropic` |

Default: **China / OpenAI-compatible** (`https://token-plan-cn.xiaomimimo.com/v1`).

Supported models (token-plan credits per million tokens: cache-hit input / cache-miss input / output):

| Model | Credits (hit/miss/out) | Cache-hit input | Cache-miss input | Output |
|-------|-----------------------|-----------------|------------------|--------|
| `mimo-v2.6-pro` | 2.5 / 300 / 600 | ¥0.025/M | ¥3.00/M | ¥6.00/M |
| `mimo-v2.6-flash` | 2 / 100 / 200 | ¥0.02/M | ¥1.00/M | ¥2.00/M |
| `mimo-v2.5-pro` | 2.5 / 300 / 600 | ¥0.025/M | ¥3.00/M | ¥6.00/M |
| `mimo-v2.5` | 2 / 100 / 200 | ¥0.02/M | ¥1.00/M | ¥2.00/M |

They are registered even when discovery fails (no key yet, or a rejected key), so `/login mimo` and `/model` always find the provider.

## Usage

Start pi normally — MiMo models appear under the `mimo` provider:

```bash
pi
```

Select a MiMo model with `/model` or use `mimo/<model-id>` directly.

## Development

Test locally without publishing:

```bash
# With env variables
MIMO_API_KEY="tp-xxxxx" MIMO_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1" pi -e ./extensions/index.ts

# With auth.json (ensure ~/.pi/agent/auth.json contains the mimo key)
pi -e ./extensions/index.ts
```

## How it works

On startup, the extension:
1. Reads config from `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_API` env vars, or `~/.pi/agent/auth.json` (also written by `/login mimo`)
2. Fetches models from `<baseUrl>/models` (falls back to OpenAI path for Anthropic endpoints)
3. Enriches with platform metadata from `https://platform.xiaomimimo.com/api/v1/models`
4. Filters out non-coding models (TTS, image-gen, embeddings, etc.)
5. Backfills with the built-in models above when discovery fails or the key is rejected
6. Registers them under the `mimo` provider

## License

MIT
