import OpenAI from 'openai';
import { callOpenAI, streamOpenAI } from './openai.ai';
import type { AiCallResult } from './anthropic.ai';
import type { VlmMessage } from './vlm.types';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

let _client: OpenAI | null = null;

export function getGroqClient(apiKey: string): OpenAI {
  if (!_client || (_client as any)._options?.apiKey !== apiKey) {
    _client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }
  return _client;
}

export async function callGroq(
  apiKey: string,
  model: string,
  system: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  tools?: OpenAI.ChatCompletionTool[],
  signal?: AbortSignal,
): Promise<AiCallResult> {
  return callOpenAI(getGroqClient(apiKey), model, system, messages, tools, signal);
}

export async function* streamGroq(
  apiKey: string,
  model: string,
  system: string,
  messages: VlmMessage[],
): AsyncGenerator<string> {
  yield* streamOpenAI(getGroqClient(apiKey), model, system, messages);
}
