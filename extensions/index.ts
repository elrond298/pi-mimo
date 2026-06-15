/**
 * Pi MiMo Extension
 *
 * Registers Xiaomi MiMo as a custom provider in pi.
 * Fetches all available models from the MiMo API at startup.
 *
 * Setup:
 *   1. Install: pi install npm:pi-mimo
 *   2. Set API key & region:
 *      - export MIMO_API_KEY="your-api-key"
 *      - export MIMO_BASE_URL="https://token-plan-sgp.xiaomimimo.com/v1"  (optional)
 *      - export MIMO_API="openai-completions"                            (optional)
 *   3. Or store in ~/.pi/agent/auth.json:
 *      {
 *        "mimo": {
 *          "type": "api_key",
 *          "key": "your-api-key",
 *          "baseUrl": "https://token-plan-sgp.xiaomimimo.com/v1",
 *          "api": "openai-completions"
 *        }
 *      }
 *   4. Run pi — models appear under provider "mimo"
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

const DEFAULT_BASE_URL = "https://token-plan-sgp.xiaomimimo.com/v1";
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
      prompt: "0.000001305",       // $1.305/M tokens (cache miss)
      completion: "0.00000261",    // $2.61/M tokens
      input_cache_read: "0.0000000108", // $0.0108/M tokens (cache hit)
    },
  },
];

export default async function (pi: ExtensionAPI) {
  const { apiKey, baseUrl, api } = resolveConfig();

  if (!apiKey) {
    console.error(
      "[pi-mimo] MIMO_API_KEY not set. Skipping MiMo provider registration.\n" +
        "Set it with one of:\n" +
        "  export MIMO_API_KEY=your-api-key\n" +
        '  echo \'{"mimo":{"type":"api_key","key":"your-api-key"}}\' >> ~/.pi/agent/auth.json',
    );
    return;
  }

  // Fetch models from token-plan API
  let modelsResponse: MiMoModelsResponse;
  try {
    const response = await fetch(getModelsListUrl(baseUrl), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `[pi-mimo] Failed to fetch models: ${response.status} ${response.statusText}`,
      );
      return;
    }

    modelsResponse = (await response.json()) as MiMoModelsResponse;
  } catch (error) {
    console.error(
      `[pi-mimo] Error fetching models: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (!modelsResponse.data || modelsResponse.data.length === 0) {
    console.error("[pi-mimo] No models returned from API.");
    return;
  }

  // Enrich with platform metadata if available
  // Seed with built-in entries first; platform API data takes precedence when available.
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

  // Filter to coding-only models
  const codingModels = modelsResponse.data.filter((model) =>
    isCodingModel(model, platformModels.get(model.id)),
  );

  if (codingModels.length === 0) {
    console.error("[pi-mimo] No coding-capable models found after filtering.");
    return;
  }

  const filtered = modelsResponse.data.length - codingModels.length;

  const models = codingModels.map((model) => {
    const plat = platformModels.get(model.id);
    const inputModalities = plat?.architecture?.input_modalities ?? ["text"];
    const input: Array<"text" | "image"> = [];
    if (inputModalities.includes("text")) input.push("text");
    if (inputModalities.includes("image")) input.push("image");

    // Parse pricing — can be single object or array (tiered)
    let costPerMillion = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    if (plat?.pricing) {
      const p = Array.isArray(plat.pricing) ? plat.pricing[0] : plat.pricing;
      costPerMillion = {
        input: Math.round(Number(p.prompt) * 1_000_000 * 100) / 100,
        output: Math.round(Number(p.completion) * 1_000_000 * 100) / 100,
        cacheRead: Math.round(Number(p.input_cache_read ?? 0) * 1_000_000 * 100) / 100,
        cacheWrite: 0,
      };
    }

    return {
      id: model.id,
      name: plat?.name ?? model.id,
      reasoning: /reasoning|pro|think/i.test(model.id),
      input: input.length > 0 ? input : (["text"] as Array<"text" | "image">),
      cost: costPerMillion,
      contextWindow: plat?.context_length ?? 128000,
      maxTokens: plat?.max_output_length ?? 131072,
    };
  });

  pi.registerProvider("mimo", {
    baseUrl,
    apiKey,
    api,
    models,
  });
}
