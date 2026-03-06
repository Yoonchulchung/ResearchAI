import { Injectable } from '@nestjs/common';
import { SessionsService } from '../../sessions/application/sessions.service';
import { VectorService } from '../../vector/vector.service';
import { callOllama } from '../../ai/infrastructure/ollama.ai';
import { AiClientService } from '../../ai/application/ai-client.service';
import { ChatMessage } from '../domain/chat-message.model';
import { ChatHistoryService } from './chat-history.service';
import { ContextCompactorService } from './context-compactor.service';

@Injectable()
export class ChatService {
  private indexedSessions = new Set<string>();

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly vectorService: VectorService,
    private readonly historyService: ChatHistoryService,
    private readonly compactor: ContextCompactorService,
    private readonly aiClient: AiClientService,
  ) {}

  private async ensureSessionIndexed(sessionId: string): Promise<void> {
    if (this.indexedSessions.has(sessionId)) return;
    if (!this.vectorService.isAvailable()) return;
    this.indexedSessions.add(sessionId);
    try {
      const session = this.sessionsService.findOne(sessionId);
      for (const task of session.tasks ?? []) {
        const result = session.results?.[task.id];
        if (result) {
          await this.vectorService.indexTaskResult(
            sessionId,
            String(task.id),
            task.title,
            task.icon,
            result,
          );
        }
      }
    } catch {
      this.indexedSessions.delete(sessionId);
    }
  }

  getHistory(sessionId: string): ChatMessage[] {
    return this.historyService.get(sessionId);
  }

  clearHistory(sessionId: string): void {
    this.historyService.clear(sessionId);
  }

  getCompactionStatus(sessionId: string) {
    return this.compactor.getStatus(sessionId);
  }

  scheduleCompaction(sessionId: string): void {
    this.compactor.schedule(sessionId);
  }

  async *chatStream(
    sessionId: string,
    message: string,
    model: string,
  ): AsyncGenerator<string> {
    const session = this.sessionsService.findOne(sessionId);
    const ragParts = (session.tasks ?? [])
      .filter((t) => session.results?.[t.id])
      .map((t) => `### ${t.icon} ${t.title}\n${session.results[t.id]}`);

    this.ensureSessionIndexed(sessionId).catch(() => {});

    let ragContext: string;
    const vectorResults = await this.vectorService.search(sessionId, message, 6);

    if (vectorResults.length > 0) {
      ragContext = vectorResults
        .map((r) => `### ${r.taskIcon} ${r.taskTitle}\n${r.text}`)
        .join('\n\n---\n\n');
    } else if (ragParts.length > 0) {
      const rawContext = ragParts.join('\n\n---\n\n');
      const hash = this.compactor.computeHash(ragParts);
      const cached = this.compactor.getCached(sessionId);
      ragContext = cached?.hash === hash ? cached.text : rawContext;
    } else {
      ragContext = '아직 완료된 리서치 결과가 없습니다.';
    }

    const systemPrompt = `당신은 "${session.topic}" 리서치 프로젝트의 전문 분석가입니다.
사용자의 질문에 아래 리서치 결과를 기반으로 답변하세요.
리서치 결과에 없는 내용은 일반 지식으로 보완하되, 리서치 결과 기반인지 일반 지식인지 구분해 주세요.
반드시 한국어로, 마크다운 형식으로 답변하세요.

## 리서치 결과
${ragContext}`;

    const history = this.historyService.get(sessionId);
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      { role: 'user', content: message },
    ];

    let fullResponse = '';

    if (model.startsWith('claude')) {
      const stream = await this.aiClient.anthropic.messages.stream({
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
      const result = await this.aiClient.google.models.generateContent({
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
      const completion = await this.aiClient.openai.chat.completions.create({
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

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: fullResponse });
    this.historyService.save(sessionId, history);
  }
}
