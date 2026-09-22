# @lesetong/pi-mimo — Extension Hub Post

## Title

**Xiaomi MiMo for Pi — Multi-region, multi-protocol, zero-config**

## Post

I built a pi extension that brings Xiaomi's MiMo models into your coding agent with flexible configuration.

### Why MiMo?

MiMo-V2.5-Pro is Xiaomi's flagship reasoning model and it's making waves:

- **#5 on OpenRouter rankings** — 902B tokens processed weekly, behind only Claude, DeepSeek, Gemini, and MiniMax
- **Top benchmarks**: #1 on ClawEval, GDPVal, and SWE-bench Pro for agentic software engineering
- **1M context window** — handles massive codebases without breaking a sweat
- **Autonomous task completion** — can independently finish professional tasks that take human experts days, involving 1000+ tool calls
- **Competitive pricing** — significantly cheaper than Claude/GPT for comparable quality

The open-source MiMo-7B-RL already matches OpenAI o1-mini on math and code reasoning (AIME 2024: 80.1, MATH500: 97.2, LiveCodeBench: 60.9). The API model (v2.5-pro) scales this up further.

### What the extension does

- **Auto-discovers** all coding-capable models from the MiMo API at startup
- **Multi-region support**: China, Singapore, Europe clusters
- **Dual protocol**: OpenAI-compatible **and** Anthropic-compatible APIs
- **`/login` support**: `pi` → `/login mimo` → paste key, no env vars needed
- **Flexible auth**: `/login`, environment variables, or `~/.pi/agent/auth.json`
- **Smart filtering**: Excludes non-coding models (TTS, embeddings, image-gen, etc.)
- **Rich metadata**: Context window, pricing, input modalities from platform API

### Setup

```bash
# Install
pi install npm:@lesetong/pi-mimo
```

**Option A — `/login` inside pi (easiest):**

Run `/login mimo`, pick **Xiaomi MiMo**, paste your key. It lands in `~/.pi/agent/auth.json`.

**Option B — Environment variables:**
```bash
export MIMO_API_KEY="tp-xxxxx"
export MIMO_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1"  # optional
export MIMO_API="openai-completions"                             # optional
```
**Option C — auth.json (no env vars):**

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

Then just run `pi` — models appear under provider `mimo`.

### Region & Protocol Matrix

| Region | OpenAI-compatible | Anthropic-compatible |
|--------|-------------------|----------------------|
| China (CN) | `https://token-plan-cn.xiaomimimo.com/v1` | `https://token-plan-cn.xiaomimimo.com/anthropic` |
| Singapore (SGP) | `https://token-plan-sgp.xiaomimimo.com/v1` | `https://token-plan-sgp.xiaomimimo.com/anthropic` |
| Europe (AMS) | `https://token-plan-ams.xiaomimimo.com/v1` | `https://token-plan-ams.xiaomimimo.com/anthropic` |

Default: China / OpenAI-compatible.

### Why another provider?

If you're hitting rate limits or costs on Claude/GPT, MiMo is a serious alternative for coding tasks. The v2.5-pro model handles complex multi-step engineering work, long context, and tool use at a fraction of the cost. Choose your nearest region for lower latency, or switch to Anthropic protocol if your tools prefer it.

### Links

- **npm**: https://www.npmjs.com/package/@lesetong/pi-mimo
- **MiMo Platform**: https://platform.xiaomimimo.com
- **Technical Report**: https://arxiv.org/abs/2505.07608
- **GitHub (MiMo models)**: https://github.com/XiaomiMiMo/MiMo
