import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { SessionsService } from '../sessions/sessions.service';
import { callOllama } from '../research/infrastructure/ai/ollama.ai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ChatService {
  private histories = new Map<string, ChatMessage[]>();

  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  constructor(private readonly sessionsService: SessionsService) {}

  getHistory(sessionId: string): ChatMessage[] {
    return this.histories.get(sessionId) ?? [];
  }

  clearHistory(sessionId: string): void {
    this.histories.delete(sessionId);
  }

  async *chatStream(
    sessionId: string,
    message: string,
    model: string,
  ): AsyncGenerator<string> {
    // 1. RAG: 세션 리서치 결과 로드
    const session = this.sessionsService.findOne(sessionId);
    const ragParts = (session.tasks ?? [])
      .filter((t) => session.results?.[t.id])
      .map((t) => `### ${t.icon} ${t.title}\n${session.results[t.id]}`);

    const ragContext =
      ragParts.length > 0
        ? ragParts.join('\n\n---\n\n')
        : '아직 완료된 리서치 결과가 없습니다.';

    const systemPrompt = `당신은 "${session.topic}" 리서치 프로젝트의 전문 분석가입니다.
사용자의 질문에 아래 리서치 결과를 기반으로 답변하세요.
리서치 결과에 없는 내용은 일반 지식으로 보완하되, 리서치 결과 기반인지 일반 지식인지 구분해 주세요.
반드시 한국어로, 마크다운 형식으로 답변하세요.

## 리서치 결과
${ragContext}`;

    // 2. RAM: 대화 히스토리 로드
    const history = this.histories.get(sessionId) ?? [];
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      { role: 'user', content: message },
    ];

    // 3. AI 호출 (스트리밍)
    let fullResponse = '';

    if (model.startsWith('claude')) {
      const stream = await this.anthropic.messages.stream({
        model,
        max_tokens: 4000,
        system: systemPrompt,
        messages,
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          fullResponse += chunk.delta.text;
          yield chunk.delta.text;
        }
      }
    } else if (model.startsWith('gemini')) {
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const result = await this.google.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt, maxOutputTokens: 4000 },
        contents,
      });
      fullResponse = result.text ?? '';
      yield fullResponse;
    } else if (model.startsWith('ollama:')) {
      const ollamaModel = model.slice('ollama:'.length);
      const historyText = history
        .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
        .join('\n');
      const prompt = historyText
        ? `${historyText}\n사용자: ${message}`
        : message;
      fullResponse = await callOllama(ollamaModel, systemPrompt, prompt);
      yield fullResponse;
    } else {
      // OpenAI
      const completion = await this.openai.chat.completions.create({
        model,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
      });
      for await (const chunk of completion) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) {
          fullResponse += text;
          yield text;
        }
      }
    }

    // 4. 히스토리 저장
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: fullResponse });
    this.histories.set(sessionId, history);
  }
}
