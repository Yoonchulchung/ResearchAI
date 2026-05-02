import OpenAI from 'openai';
import { callOpenAI, streamOpenAI } from './openai.ai';
import type { AiCallResult } from './anthropic.ai';
import type { VlmMessage } from './vlm.types';
import { GROQ_FREE_MAX_INPUT_CHARS } from '../../domain/models';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
// 무료 티어 TPM 12,000: 출력 2,000 토큰 예약 → 입력 최대 10,000 토큰
const GROQ_FREE_MAX_OUTPUT_TOKENS = 2_000;

let _client: OpenAI | null = null;

export function getGroqClient(apiKey: string): OpenAI {
  if (!_client || (_client as any)._options?.apiKey !== apiKey) {
    _client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }
  return _client;
}

/** 전체 chars가 한도를 넘으면 마지막 user 메시지 내용을 잘라낸다. */
function truncateForGroqFree(
  system: string,
  messages: OpenAI.ChatCompletionMessageParam[],
): OpenAI.ChatCompletionMessageParam[] {
  const getContent = (m: OpenAI.ChatCompletionMessageParam): string =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

  const totalChars = system.length + messages.reduce((s, m) => s + getContent(m).length, 0);
  if (totalChars <= GROQ_FREE_MAX_INPUT_CHARS) return messages;

  // 마지막 user 메시지부터 역순으로 잘라낸다
  const result = messages.map((m) => ({ ...m })) as OpenAI.ChatCompletionMessageParam[];
  let remaining = totalChars - GROQ_FREE_MAX_INPUT_CHARS;

  for (let i = result.length - 1; i >= 0 && remaining > 0; i--) {
    const content = getContent(result[i]);
    if (content.length <= remaining) {
      // 이 메시지 전체 제거
      remaining -= content.length;
      result.splice(i, 1);
    } else {
      // 뒷부분만 잘라내고 생략 표시 추가
      const trimmed = content.slice(0, content.length - remaining - 50) + '\n...(내용 일부 생략됨)';
      (result[i] as any).content = trimmed;
      remaining = 0;
    }
  }

  return result;
}

/** VlmMessage 배열용 동일 처리 */
function truncateVlmForGroqFree(system: string, messages: VlmMessage[]): VlmMessage[] {
  const getContent = (m: VlmMessage): string =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

  const totalChars = system.length + messages.reduce((s, m) => s + getContent(m).length, 0);
  if (totalChars <= GROQ_FREE_MAX_INPUT_CHARS) return messages;

  const result = messages.map((m) => ({ ...m }));
  let remaining = totalChars - GROQ_FREE_MAX_INPUT_CHARS;

  for (let i = result.length - 1; i >= 0 && remaining > 0; i--) {
    const content = getContent(result[i]);
    if (content.length <= remaining) {
      remaining -= content.length;
      result.splice(i, 1);
    } else {
      result[i] = { ...result[i], content: content.slice(0, content.length - remaining - 50) + '\n...(내용 일부 생략됨)' };
      remaining = 0;
    }
  }

  return result;
}

export async function callGroq(
  apiKey: string,
  model: string,
  system: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  tools?: OpenAI.ChatCompletionTool[],
  signal?: AbortSignal,
): Promise<AiCallResult> {
  const truncated = truncateForGroqFree(system, messages);
  return callOpenAI(getGroqClient(apiKey), model, system, truncated, tools, signal, GROQ_FREE_MAX_OUTPUT_TOKENS);
}

export async function* streamGroq(
  apiKey: string,
  model: string,
  system: string,
  messages: VlmMessage[],
): AsyncGenerator<string> {
  const truncated = truncateVlmForGroqFree(system, messages);
  yield* streamOpenAI(getGroqClient(apiKey), model, system, truncated, GROQ_FREE_MAX_OUTPUT_TOKENS);
}
