import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SessionsService } from '../../sessions/application/sessions.service';
import { AiProviderService } from '../../ai/infrastructure/ai-provider.service';
import { VectorService } from '../../vector/vector.service';
import { ChatRepository } from '../domain/repository/chat.repository';
import { ChatMessage, ChatRole } from '../domain/chat-message.model';
import { WhoSent } from '../domain/entity/chat.entity';
import { getProvider, AIProvider } from '../../ai/domain/models';
import { WebSearchService } from '../../research/application/web-search.service';
import { SearchEngine } from '../../research/domain/model/search-planner.model';

export interface ChatStreamEvent {
  type: 'chunk' | 'status';
  text: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly chatRepository: ChatRepository,
    private readonly aiProvider: AiProviderService,
    private readonly vectorService: VectorService,
    private readonly webSearchService: WebSearchService,
  ) {}

  /** UI 표시용: 원본 메시지만 반환 */
  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.chatRepository.findBySessionId(sessionId);
    return rows.map((row) => ({
      role: row.whoSent === WhoSent.USER ? ChatRole.USER : ChatRole.ASSISTANT,
      content: row.message,
    }));
  }

  /** AI 컨텍스트용: 검색 결과 포함 버전 반환 (없으면 원본 사용) */
  private async getHistoryForAI(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.chatRepository.findBySessionId(sessionId);
    return rows.map((row) => ({
      role: row.whoSent === WhoSent.USER ? ChatRole.USER : ChatRole.ASSISTANT,
      content: row.contextMessage ?? row.message,
    }));
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.chatRepository.deleteBySessionId(sessionId);
  }

  private async appendMessage(sessionId: string, role: ChatRole, content: string, contextMessage?: string | null): Promise<void> {
    await this.chatRepository.save({
      id: randomUUID(),
      sessionId,
      whoSent: role === ChatRole.USER ? WhoSent.USER : WhoSent.AI,
      message: content,
      contextMessage: contextMessage ?? null,
    });
  }

  // ******* //
  // 채팅 생성 //
  // ******* //

  /** Sliding Window 크기: 최근 N개 메시지만 컨텍스트로 사용 */
  private static readonly WINDOW_SIZE = 20;

  async *chatStream(
    sessionId: string,
    message: string,
    aiModel: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const session = await this.sessionsService.findOne(sessionId);

    // 현재 메시지는 아직 저장하지 않음 — 검색 결과 포함 후 저장
    const rawHistory = await this.getHistoryForAI(sessionId);

    // RAG 컨텍스트 구성
    let ragContext: string;
    const vectorResults = await this.vectorService.search(sessionId, message, 6);

    if (vectorResults.length > 0) {
      ragContext = vectorResults
        .map((r) => `### ${r.taskTitle}\n${r.text}`)
        .join('\n\n---\n\n');
    } else {
      const items = await this.sessionsService.findItemsWithResults(sessionId);
      ragContext = items.length > 0
        ? items.map((item) => `### ${item.topic}\n${item.aiResult}`).join('\n\n---\n\n')
        : '아직 완료된 리서치 결과가 없습니다.';
    }

    // *** 에이전트 검색 ***
    const provider = getProvider(aiModel);
    const supportsTools = provider === AIProvider.ANTHROPIC || provider === AIProvider.OPENAI || provider === AIProvider.OLLAMA;
    const isLocal = provider === AIProvider.OLLAMA;

    const systemPrompt = isLocal
      ? `[CURRENT QUESTION - TOP PRIORITY] "${message}"
Focus on answering this question. Previous conversation and research results are for reference only.

---
[RULES] Never use emojis. Text only.
[URL RULE] Only cite URLs that appear in search result '출처:' fields. Never fabricate or guess URLs. If no source URL exists, answer without URLs.

You are a senior research analyst specializing in "${session.topic}".

Guidelines:
- Lead with the conclusion, then support with evidence.
- Avoid hedging phrases like "it appears that" or "it seems like".
- Write in flowing sentences, not bullet lists.
- Quote URLs, figures, and article titles from previous conversation as-is.
- Always respond in Korean.

## Research Results
${ragContext}`
      : `[현재 질문 - 최우선] "${message}"
이 질문에 집중해서 답변하세요. 이전 대화와 리서치 결과는 참고용입니다.

---
[필수 규칙] 답변에 이모지(👋📌😊 등)를 절대 사용하지 마세요. 텍스트만 사용하세요.
[URL 규칙] URL은 반드시 검색 결과의 '출처:' 항목에 있는 것만 인용하세요. URL을 직접 생성하거나 추측하지 마세요. 출처 URL이 없으면 URL 없이 답변하세요.

당신은 "${session.topic}" 분야의 시니어 리서치 애널리스트입니다.

답변 원칙:
- 결론부터 말하고, 이유와 근거를 이어서 서술하세요.
- "~로 보입니다", "~것으로 판단됩니다" 같은 AI 특유의 단어 사용을 피하세요.
- 단순 나열 대신 흐름 있는 문장으로 서술하세요.
- 이전 대화에서 언급된 URL, 수치, 기사 제목 등은 그대로 인용하세요.
- 한국어로 작성하세요.

## 리서치 결과
${ragContext}`;
    let extraContext = '';

    if (supportsTools) {
      const anthropicTool = {
        name: 'web_search',
        description: '최신 뉴스, 구체적인 수치·사례, 리서치 데이터에 없는 내용을 DuckDuckGo로 검색합니다.',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string', description: '검색 쿼리 (영어 권장)' } },
          required: ['query'],
        },
      };
      const openaiTool = {
        type: 'function',
        function: {
          name: 'web_search',
          description: '최신 뉴스, 구체적인 수치·사례, 리서치 데이터에 없는 내용을 DuckDuckGo로 검색합니다.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: '검색 쿼리 (영어 권장)' } },
            required: ['query'],
          },
        },
      };
      const tools = provider === AIProvider.ANTHROPIC ? [anthropicTool] : [openaiTool];

      const decisionPrompt = isLocal
        ? `Topic: "${session.topic}".
Call web_search ONLY IF the user is explicitly asking for recent news, specific data, or facts not commonly known.
Do NOT call web_search for: greetings, simple questions, opinions, follow-up conversation, or anything answerable from general knowledge.
If unsure, do NOT search.`
        : `주제: "${session.topic}". 사용자 질문에 답변하기 위해 최신 뉴스·구체적 수치·리서치에 없는 사실이 필요할 때만 web_search를 호출하세요. 인사말, 간단한 질문, 일반 상식으로 답할 수 있는 경우에는 호출하지 마세요.`;

      const decision = await this.aiProvider.call(
        aiModel,
        decisionPrompt,
        [{ role: 'user', content: message }],
        { tools },
      );

      if (decision.toolCalls?.length) {
        const parts: string[] = [];
        for (const tc of decision.toolCalls) {
          const query = (tc.input as { query: string }).query;
          yield { type: 'status', text: `"${query}" 검색 중...` };
          const raw = await this.webSearchService.searchRaw(SearchEngine.DUCKDUCKGO, query);
          if (raw) parts.push(`### 검색: ${query}\n${raw}`);
        }
        if (parts.length > 0) {
          extraContext = parts.join('\n\n---\n\n');
        }
      }
    }

    // *** 유저 메시지 저장: UI용(원본)과 AI 컨텍스트용(검색 결과 포함) 분리 ***
    const contextUserContent = extraContext
      ? `${message}\n\n[참조한 웹 검색 결과]\n${extraContext}`
      : null;
    await this.appendMessage(sessionId, ChatRole.USER, message, contextUserContent);

    // *** Sliding Window: 최근 WINDOW_SIZE개 메시지 + 현재 메시지 ***
    const windowedHistory = (rawHistory as { role: 'user' | 'assistant'; content: string }[])
      .slice(-ChatService.WINDOW_SIZE);
    const streamMessages = [
      ...windowedHistory,
      { role: 'user' as const, content: contextUserContent ?? message },
    ];

    // *** 최종 스트리밍 답변 ***
    const searchSuffix = extraContext
      ? isLocal
        ? `\n\n---\n[SEARCH COMPLETE] Answer based on the search results above. Do not say you cannot search.`
        : `\n\n---\n[검색 완료] 위 검색 결과를 바탕으로 답변하세요. "검색할 수 없다"는 응답은 하지 마세요.`
      : '';
    const finalSystem = `${systemPrompt}${searchSuffix}`;

    let fullResponse = '';
    for await (const chunk of this.aiProvider.stream(aiModel, finalSystem, streamMessages)) {
      fullResponse += chunk;
      yield { type: 'chunk', text: chunk };
    }

    await this.appendMessage(sessionId, ChatRole.ASSISTANT, fullResponse);
  }
}
