import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { SessionsService } from '../sessions/sessions.service';
import { VectorService } from '../vector/vector.service';
import { callOllama } from '../research/infrastructure/ai/ollama.ai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CompactedEntry {
  text: string;
  hash: string;
  compactedAt: Date;
}

@Injectable()
export class ChatService {
  private histories = new Map<string, ChatMessage[]>();
  private compactedContexts = new Map<string, CompactedEntry>();
  private compactionQueue = new Set<string>();

  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

  // 기존 세션 중 아직 인덱싱되지 않은 세션 추적
  private indexedSessions = new Set<string>();

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly vectorService: VectorService,
  ) {}

  // 기존 세션의 결과를 백그라운드에서 벡터 인덱싱 (서버 재시작 후 복원)
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
    if (this.histories.has(sessionId)) return this.histories.get(sessionId)!;
    try {
      const filePath = this.sessionsService.chatPath(sessionId);
      if (fs.existsSync(filePath)) {
        const history = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ChatMessage[];
        this.histories.set(sessionId, history);
        return history;
      }
    } catch {}
    return [];
  }

  private saveHistory(sessionId: string, history: ChatMessage[]): void {
    try {
      fs.writeFileSync(this.sessionsService.chatPath(sessionId), JSON.stringify(history, null, 2), 'utf-8');
    } catch {}
    this.histories.set(sessionId, history);
  }

  clearHistory(sessionId: string): void {
    this.histories.delete(sessionId);
    try {
      const filePath = this.sessionsService.chatPath(sessionId);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }

  private buildRagParts(sessionId: string): string[] {
    const session = this.sessionsService.findOne(sessionId);
    return (session.tasks ?? [])
      .filter((t) => session.results?.[t.id])
      .map((t) => `### ${t.icon} ${t.title}\n${session.results[t.id]}`);
  }

  private computeHash(ragParts: string[]): string {
    return ragParts.map((p) => p.length).join(',') + `|${ragParts.length}`;
  }

  getCompactionStatus(sessionId: string): {
    status: 'idle' | 'running' | 'done';
    compactedAt?: Date;
  } {
    if (this.compactionQueue.has(sessionId)) return { status: 'running' };
    const cached = this.compactedContexts.get(sessionId);
    if (cached) return { status: 'done', compactedAt: cached.compactedAt };
    return { status: 'idle' };
  }

  scheduleCompaction(sessionId: string): void {
    if (this.compactionQueue.has(sessionId)) return;
    let ragParts: string[];
    try {
      ragParts = this.buildRagParts(sessionId);
    } catch {
      return;
    }
    if (ragParts.length === 0) return;

    const hash = this.computeHash(ragParts);
    const cached = this.compactedContexts.get(sessionId);
    if (cached?.hash === hash) return; // already up-to-date

    this.compactionQueue.add(sessionId);
    this.runCompaction(sessionId, ragParts.join('\n\n---\n\n'), hash).catch(() => {});
  }

  private async runCompaction(
    sessionId: string,
    rawContext: string,
    hash: string,
  ): Promise<void> {
    const ollamaModel = process.env.OLLAMA_COMPRESS_MODEL ?? 'llama3.1';
    const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                '당신은 리서치 문서를 압축하는 전문가입니다. 핵심 정보, 수치, 결론, 인사이트를 빠짐없이 보존하면서 문서를 간결하게 요약하세요.',
            },
            {
              role: 'user',
              content: `아래 리서치 결과를 압축해주세요.\n- 중요 데이터, 수치, 결론은 반드시 보존\n- 반복되는 내용 제거\n- 섹션 구조 유지\n- 원문 언어 유지\n\n## 리서치 결과\n${rawContext}`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const compressed = data.message?.content ?? '';
        if (compressed) {
          this.compactedContexts.set(sessionId, {
            text: compressed,
            hash,
            compactedAt: new Date(),
          });
        }
      }
    } catch {
      // 압축 실패 시 무시, 다음 호출 시 재시도
    } finally {
      this.compactionQueue.delete(sessionId);
    }
  }

  async *chatStream(
    sessionId: string,
    message: string,
    model: string,
  ): AsyncGenerator<string> {
    // 1. RAG: 벡터 검색 → compaction fallback → raw fallback 순서로 컨텍스트 구성
    const session = this.sessionsService.findOne(sessionId);
    const ragParts = (session.tasks ?? [])
      .filter((t) => session.results?.[t.id])
      .map((t) => `### ${t.icon} ${t.title}\n${session.results[t.id]}`);

    // 기존 세션 결과를 백그라운드에서 인덱싱 (서버 재시작 후 복원)
    this.ensureSessionIndexed(sessionId).catch(() => {});

    let ragContext: string;
    const vectorResults = await this.vectorService.search(sessionId, message, 6);

    if (vectorResults.length > 0) {
      // 벡터 검색 결과 사용 (가장 정확한 방식)
      ragContext = vectorResults
        .map((r) => `### ${r.taskIcon} ${r.taskTitle}\n${r.text}`)
        .join('\n\n---\n\n');
    } else if (ragParts.length > 0) {
      // fallback: compaction 또는 raw
      const rawContext = ragParts.join('\n\n---\n\n');
      const hash = this.computeHash(ragParts);
      const cached = this.compactedContexts.get(sessionId);
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

    // 2. RAM: 대화 히스토리 로드
    const history = this.getHistory(sessionId);
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
    this.saveHistory(sessionId, history);
  }
}
