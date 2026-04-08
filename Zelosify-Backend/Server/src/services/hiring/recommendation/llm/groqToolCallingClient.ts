import axios from "axios";
import { logStructured } from "../utils/structuredLogger.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

const RAW_TIMEOUT_MS = Number(process.env.RECOMMENDATION_LLM_TIMEOUT_MS || 6000);
const LLM_TIMEOUT_MS = Number.isFinite(RAW_TIMEOUT_MS)
  ? Math.max(5000, Math.min(RAW_TIMEOUT_MS, 12000))
  : 6000;
const GROQ_MAX_RATE_LIMIT_RETRIES = Number(process.env.GROQ_MAX_RATE_LIMIT_RETRIES || 2);
const DEFAULT_RETRY_DELAY_MS = 3000;
const MAX_RETRY_DELAY_MS = 30000;

export type GroqTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type NormalizedMessage = {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRetryDelayMsFromRateLimitMessage(message: string): number {
  const secondsMatch = message.match(/try again in\s*(\d+(?:\.\d+)?)\s*seconds?/i);
  if (secondsMatch) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(500, Number(secondsMatch[1]) * 1000));
  }

  const compactMatch = message.match(/try again in\s*(\d+)m\s*(\d+(?:\.\d+)?)s/i);
  if (compactMatch) {
    const minutes = Number(compactMatch[1]);
    const seconds = Number(compactMatch[2]);
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(500, (minutes * 60 + seconds) * 1000));
  }

  const shortSecondsMatch = message.match(/in\s*(\d+(?:\.\d+)?)s/i);
  if (shortSecondsMatch) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(500, Number(shortSecondsMatch[1]) * 1000));
  }

  return DEFAULT_RETRY_DELAY_MS;
}

function isRateLimitError(status: number | undefined, data: unknown): boolean {
  if (status === 429) {
    return true;
  }

  const dataString = JSON.stringify(data || {}).toLowerCase();
  return dataString.includes("rate_limit_exceeded") || dataString.includes("too many requests");
}

function normalizeMessages(messages: Array<Record<string, unknown>>): NormalizedMessage[] {
  return messages
    .map((message) => {
      const role = typeof message.role === "string" ? message.role.trim() : "user";
      const rawContent = message.content;
      const content =
        typeof rawContent === "string"
          ? rawContent.trim()
          : rawContent === undefined || rawContent === null
          ? ""
          : JSON.stringify(rawContent);

      const normalized: NormalizedMessage = {
        role,
        content: content || "No content",
      };

      if (typeof message.tool_call_id === "string" && message.tool_call_id.trim()) {
        normalized.tool_call_id = message.tool_call_id;
      }

      if (message.tool_calls !== undefined) {
        normalized.tool_calls = message.tool_calls;
      }

      return normalized;
    })
    .filter((message) => Boolean(message.role));
}

export async function callGroqWithTools(input: {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools: GroqTool[];
  temperature?: number;
  traceContext?: {
    profileId: number;
    openingId: string;
  };
}) {
    const traceProfileId = Number(input.traceContext?.profileId || 0);
    const traceOpeningId = String(input.traceContext?.openingId || "").trim() || null;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!model) {
    throw new Error("GROQ model is missing");
  }

  const messages = normalizeMessages(input.messages || []);
  if (messages.length === 0) {
    throw new Error("LLM messages payload is empty");
  }

  const tools = Array.isArray(input.tools) ? input.tools.filter(Boolean) : [];

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: input.temperature ?? 0.1,
  };

  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  for (let attempt = 0; attempt <= GROQ_MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      const response = await axios.post(GROQ_BASE_URL, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: LLM_TIMEOUT_MS,
      });

      const usage = response?.data?.usage || null;
      logStructured("llm_api_usage", {
        profileId: traceProfileId,
        openingId: traceOpeningId,
        model,
        attempt,
        usage,
      });

      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const providerMessage =
        data?.error?.message || data?.message || error?.message || "Unknown provider error";

      const isRateLimited = isRateLimitError(status, data);
      if (isRateLimited && attempt < GROQ_MAX_RATE_LIMIT_RETRIES) {
        const retryDelayMs = extractRetryDelayMsFromRateLimitMessage(String(providerMessage));
        logStructured("llm_api_retry", {
          profileId: traceProfileId,
          openingId: traceOpeningId,
          attempt: attempt + 1,
          maxRetries: GROQ_MAX_RATE_LIMIT_RETRIES,
          retryDelayMs,
          status,
          providerMessage,
        });

        await wait(retryDelayMs);
        continue;
      }

      logStructured("llm_api_failed", {
        profileId: traceProfileId,
        openingId: traceOpeningId,
        status,
        data,
        model,
        timeoutMs: LLM_TIMEOUT_MS,
        messageCount: messages.length,
        toolsCount: tools.length,
        attempt,
      });

      if (isRateLimited) {
        throw new Error(
          `GROQ_RATE_LIMIT_EXCEEDED: ${providerMessage} (retries_exhausted=${GROQ_MAX_RATE_LIMIT_RETRIES})`
        );
      }

      if (status) {
        throw new Error(`GROQ_API_ERROR_${status}: ${JSON.stringify(data || {})}`);
      }

      throw error;
    }
  }

  throw new Error("GROQ_RATE_LIMIT_EXCEEDED: Retries exhausted");
}
