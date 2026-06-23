import OpenAI from 'openai';

/** OpenAI 호환 llama.cpp 서버의 API base URL입니다. */
const LLAMA_CPP_BASE_URL = () =>
  (process.env.LLAMA_CPP_BASE_URL ?? 'http://localhost:8080') + '/v1';

let _client: OpenAI | null = null;

export function getLlamaCppClient(): OpenAI {
  const baseURL = LLAMA_CPP_BASE_URL();
  if (!_client || _client.baseURL !== baseURL) {
    _client = new OpenAI({ baseURL, apiKey: 'no-key' });
  }
  return _client;
}

export async function getLlamaCppModels(): Promise<{ name: string }[]> {
  try {
    const client = getLlamaCppClient();
    const res = await client.models.list();
    return res.data.map((m) => ({ name: m.id }));
  } catch {
    return [];
  }
}
