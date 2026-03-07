import { Injectable } from '@nestjs/common';
import { VectorService } from '../../vector/vector.service';
import { SessionsService } from '../../sessions/application/sessions.service';
import { AiClientService } from './ai-client.service';
import { callOllama } from '../infrastructure/ollama.ai';
import { ChatMessage } from '../../chat/domain/chat-message.model';

@Injectable()
export class AiChatService {
  constructor(
    private readonly vectorService: VectorService,
    private readonly sessionsService: SessionsService,
    private readonly aiClient: AiClientService,
  ) {}

  async *stream(
    sessionId: string,
    topic: string,
    message: string,
    model: string,
    history: ChatMessage[],
  ): AsyncGenerator<string> {
    // RAG 컨텍스트 구성
    let ragContext: string;
    const vectorResults = await this.vectorService.search(sessionId, message, 6);

    if (vectorResults.length > 0) {
      ragContext = vectorResults
        .map((r) => `### ${r.taskIcon} ${r.taskTitle}\n${r.text}`)
        .join('\n\n---\n\n');
    } else {
      const items = await this.sessionsService.findItemsWithResults(sessionId);
      if (items.length > 0) {
        ragContext = items
          .map((item) => `### ${item.topic}\n${item.aiResult}`)
          .join('\n\n---\n\n');
      } else {
        ragContext = '아직 완료된 리서치 결과가 없습니다.';
      }
    }

    const systemPrompt = `당신은 "${topic}" 리서치 프로젝트의 전문 분석가입니다.
사용자의 질문에 아래 리서치 결과를 기반으로 답변하세요.
리서치 결과에 없는 내용은 일반 지식으로 보완하되, 리서치 결과 기반인지 일반 지식인지 구분해 주세요.
반드시 한국어로, 마크다운 형식으로 답변하세요.

## 리서치 결과
${ragContext}`;

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [...history];

    if (model.startsWith('claude')) {
      const stream = await this.aiClient.anthropic.messages.stream({
        model,
        max_tokens: 4000,
        system: systemPrompt,
        messages,
      });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield chunk.delta.text;
        }
      }
    } else if (model.startsWith('gemini')) {
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const result = await this.aiClient.google.models.generateContent({
        model,
        config: { systemInstruction: systemPrompt, maxOutputTokens: 4000 },
        contents,
      });
      yield result.text ?? '';
    } else if (model.startsWith('ollama:')) {
      const ollamaModel = model.slice('ollama:'.length);
      const historyText = history
        .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
        .join('\n');
      const prompt = historyText ? `${historyText}\n사용자: ${message}` : message;
      yield await callOllama(ollamaModel, systemPrompt, prompt);
    } else {
      const completion = await this.aiClient.openai.chat.completions.create({
        model,
        max_tokens: 4000,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      });
      for await (const chunk of completion) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) yield text;
      }
    }
  }
}
