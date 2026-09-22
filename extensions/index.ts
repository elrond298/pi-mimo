/**
 * Pi MiMo Extension
 *
 * Registers Xiaomi MiMo as a custom provider in pi.
 * Fetches all available models from the MiMo API at startup.
 *
 * Setup:
 *   1. Install: pi install npm:pi-mimo
 *   2. Log in inside pi:  /login mimo   (stores the key in ~/.pi/agent/auth.json)
 *   3. Or set env vars:
 *      - export MIMO_API_KEY="your-api-key"
 *      - export MIMO_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1"  (optional)
 *      - export MIMO_API="openai-completions"                            (optional)
 *   4. Or store everything in ~/.pi/agent/auth.json:
 *      {
 *        "mimo": {
 *          "type": "api_key",
 *          "key": "your-api-key",
 *          "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
 *          "api": "openai-completions"
 *        }
 *      }
 *   5. Run pi — models appear under provider "mimo"
 *
 * Or test locally:
 *   MIMO_API_KEY="your-key" pi -e ./extensions/index.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface MiMoModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

interface MiMoModelsResponse {
  object: string;
  data: MiMoModel[];
}

interface MiMoPlatformModel {
  id: string;
  name: string;
  context_length: number;
  max_output_length: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
  };
  pricing:
    | { prompt: string; completion: string; input_cache_read?: string }
    | Array<{ prompt: string; completion: string; input_cache_read?: string }>;
}

const DEFAULT_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
const PLATFORM_URL = "https://platform.xiaomimimo.com/api/v1";
type MiMoApi = "openai-completions" | "anthropic-messages";

/** Resolve config from env vars or auth.json. */
function resolveConfig(): {
  apiKey?: string;
  baseUrl: string;
  api: MiMoApi;
} {
  // 1. Environment variables
  const envKey = process.env.MIMO_API_KEY;
  const envBaseUrl = process.env.MIMO_BASE_URL;
  const envApi = process.env.MIMO_API;

  // 2. pi auth.json
  let authKey: string | undefined;
  let authBaseUrl: string | undefined;
  let authApi: string | undefined;

  try {
    const authPath = path.join(os.homedir(), ".pi", "agent", "auth.json");
    if (fs.existsSync(authPath)) {
      const raw = fs.readFileSync(authPath, "utf-8");
      const auth = JSON.parse(raw);
      const entry = auth["mimo"];
      if (entry?.type === "api_key" && entry.key) {
        authKey = entry.key;
      }
      if (entry?.baseUrl) {
        authBaseUrl = entry.baseUrl;
      }
      if (entry?.api) {
        authApi = entry.api;
      }
    }
  } catch {
    // ignore auth.json errors
  }

  const apiKey = envKey || authKey;
  const baseUrl = envBaseUrl || authBaseUrl || DEFAULT_BASE_URL;

  let api: MiMoApi = "openai-completions";
  const rawApi = envApi || authApi;
  if (rawApi === "anthropic-messages") {
    api = "anthropic-messages";
  } else if (rawApi && rawApi !== "openai-completions") {
    console.warn(
      `[pi-mimo] Unsupported api "${rawApi}", falling back to "openai-completions"`,
    );
  }

  return { apiKey, baseUrl, api };
}

/** Build the models listing URL.
 *  Anthropic endpoints don't expose a standard /models listing,
 *  so fall back to the OpenAI-compatible path on the same host. */
function getModelsListUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/anthropic")) {
    return baseUrl.replace(/\/anthropic$/, "/v1") + "/models";
  }
  return baseUrl + "/models";
}

/** Model ID patterns to exclude — non-coding models (TTS, STT, image gen, audio, etc.) */
const EXCLUDED_MODEL_PATTERNS = [
  /tts/i,
  /speech/i,
  /audio/i,
  /voice/i,
  /asr/i,
  /whisper/i,
  /sound/i,
  /music/i,
  /image[-_]?gen/i,
  /txt2img/i,
  /img2img/i,
  /embedding/i,
  /rerank/i,
  /moderation/i,
];

/** Check if model is coding-capable (text-in, text-out). */
function isCodingModel(model: MiMoModel, plat?: MiMoPlatformModel): boolean {
  // Exclude by ID pattern
  if (EXCLUDED_MODEL_PATTERNS.some((p) => p.test(model.id))) return false;

  // If platform metadata available, check modality
  if (plat?.architecture) {
    const { input_modalities, output_modalities } = plat.architecture;
    const hasTextInput = input_modalities?.includes("text");
    const hasTextOutput = output_modalities?.includes("text");
    // Must accept text input AND produce text output
    if (!hasTextInput || !hasTextOutput) return false;
    // Exclude if output is audio-only or image-only
    const outputIsOnlyNonText =
      output_modalities?.length === 1 &&
      (output_modalities[0] === "audio" || output_modalities[0] === "image");
    if (outputIsOnlyNonText) return false;
  }

  return true;
}

/** Built-in platform metadata for models not yet listed on the platform API. */
const BUILTIN_PLATFORM_MODELS: MiMoPlatformModel[] = [
  {
    id: "mimo-v2.5-pro-ultraspeed",
    name: "Xiaomi MiMo:mimo-v2.5-pro-ultraspeed",
    context_length: 1048576,
    max_output_length: 131072,
    architecture: {
      modality: "text->text",
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    // Pricing in USD per token (divide the per-million price by 1,000,000)
    pricing: {
      prompt: "0.00000435", // $4.35/M tokens (cache miss)
      completion: "0.0000087", // $8.70/M tokens
      input_cache_read: "0.000000036", // $0.036/M tokens (cache hit)
    },
  },
  // MiMo-V2.6 / V2.5-Pro. Pricing in USD per token (divide the per-million
  // price by 1,000,000), matching platform.xiaomimimo.com and the token-plan
  // credit table (300 credits per M input = ¥3.00/M = $0.435/M).
  {
    id: "mimo-v2.6-pro",
    name: "MiMo V2.6 Pro",
    context_length: 1048576,
    max_output_length: 131072,
    architecture: {
      modality: "text->text",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
    },
    pricing: {
      prompt: "0.000000435", // $0.435/M tokens (cache miss)
      completion: "0.00000087", // $0.87/M tokens
      input_cache_read: "0.0000000036", // $0.0036/M tokens (cache hit)
    },
  },
  {
    id: "mimo-v2.6-flash",
    name: "MiMo V2.6 Flash",
    context_length: 1048576,
    max_output_length: 131072,
    architecture: {
      modality: "text->text",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
    },
    pricing: {
      prompt: "0.00000014", // $0.14/M tokens (cache miss)
      completion: "0.00000028", // $0.28/M tokens
      input_cache_read: "0.0000000028", // $0.0028/M tokens (cache hit)
    },
  },
  {
    id: "mimo-v2.5-pro",
    name: "MiMo V2.5 Pro",
    context_length: 1048576,
    max_output_length: 131072,
    architecture: {
      modality: "text->text",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
    },
    pricing: {
      prompt: "0.000000435", // $0.435/M tokens (cache miss)
      completion: "0.00000087", // $0.87/M tokens
      input_cache_read: "0.0000000036", // $0.0036/M tokens (cache hit)
    },
  },
];

/** Convert a model id plus optional platform metadata into a pi model definition. */
function toModelDef(id: string, plat?: MiMoPlatformModel) {
  const inputModalities = plat?.architecture?.input_modalities ?? ["text"];
  const input: Array<"text" | "image"> = [];
  if (inputModalities.includes("text")) input.push("text");
  if (inputModalities.includes("image")) input.push("image");

  // Parse pricing — can be single object or array (tiered). Values are USD per
  // token (0.000000435 = $0.435/M), rounded to 4 decimals of the per-million price.
  let cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (plat?.pricing) {
    const p = Array.isArray(plat.pricing) ? plat.pricing[0] : plat.pricing;
    const perMillion = (v?: string) => Math.round(Number(v ?? 0) * 1_000_000 * 10_000) / 10_000;
    cost = {
      input: perMillion(p.prompt),
      output: perMillion(p.completion),
      cacheRead: perMillion(p.input_cache_read),
      cacheWrite: 0,
    };
  }

  const isReasoning = /reasoning|pro|think/i.test(id);

  return {
    id,
    name: plat?.name ?? id,
    reasoning: isReasoning,
    // Map pi thinking levels to MiMo reasoning_effort values.
    // MiMo accepts only "low" | "medium" | "high" (verified against the API);
    // anything else returns 400 Invalid request parameters. "minimal" -> "low".
    // null hides "xhigh"/"max" from the UI. If a config or CLI flag still
    // requests one, pi's clampThinkingLevel() resolves it to "high" before sending.
    thinkingLevelMap: { minimal: "low", xhigh: null, max: null },
    input: input.length > 0 ? input : (["text"] as Array<"text" | "image">),
    cost,
    contextWindow: plat?.context_length ?? 128000,
    maxTokens: plat?.max_output_length ?? 131072,
  };
}

export default async function (pi: ExtensionAPI) {
  const { apiKey, baseUrl, api } = resolveConfig();

  // Platform metadata (context window, max output, pricing, modalities).
  // Built-ins seed the map; live platform data wins for shared IDs.
  const platformModels: Map<string, MiMoPlatformModel> = new Map(
    BUILTIN_PLATFORM_MODELS.map((m) => [m.id, m]),
  );
  try {
    const platResp = await fetch(`${PLATFORM_URL}/models`);
    if (platResp.ok) {
      const platData = (await platResp.json()) as { data: MiMoPlatformModel[] };
      for (const m of platData.data) {
        // Platform API uses "xiaomi/" prefix (e.g. "xiaomi/mimo-v2.5-pro"),
        // but token-plan API returns bare IDs (e.g. "mimo-v2.5-pro").
        // Store both forms so lookup by either key works.
        platformModels.set(m.id, m);
        const bare = m.id.replace(/^.*\//, "");
        if (bare !== m.id) platformModels.set(bare, m);
      }
    }
  } catch {
    // Platform metadata optional — proceed without
  }

  // Live model discovery. Skipped without a key: /login can still be used
  // afterwards, and the built-in models below are registered either way.
  const liveIds: string[] = [];
  if (apiKey) {
    try {
      const response = await fetch(getModelsListUrl(baseUrl), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const { data = [] } = (await response.json()) as MiMoModelsResponse;
        liveIds.push(
          ...data
            .filter((model) => isCodingModel(model, platformModels.get(model.id)))
            .map((m) => m.id),
        );
      } else {
        console.error(
          `[pi-mimo] Failed to fetch models: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(
        `[pi-mimo] Error fetching models: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    console.error(
      "[pi-mimo] No MiMo API key yet — registering built-in models. Add one with:\n" +
        "  /login mimo\n" +
        '  export MIMO_API_KEY="your-api-key"\n' +
        '  or ~/.pi/agent/auth.json -> {"mimo":{"type":"api_key","key":"your-api-key"}}',
    );
  }

  // Built-ins backfill discovery so MiMo models exist before /login, when the
  // key is rejected, or when the API is unreachable.
  const modelIds = [...new Set([...liveIds, ...BUILTIN_PLATFORM_MODELS.map((m) => m.id)])];

  pi.registerProvider("mimo", {
    name: "Xiaomi MiMo",
    baseUrl,
    // pi resolves the key from the stored credential (/login) or $MIMO_API_KEY.
    apiKey: "$MIMO_API_KEY",
    api,
    models: modelIds.map((id) => toModelDef(id, platformModels.get(id))),
  });
}
