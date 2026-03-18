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

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.chatRepository.findBySessionId(sessionId);
    return rows.map((row) => ({
      role: row.whoSent === WhoSent.USER ? ChatRole.USER : ChatRole.ASSISTANT,
      content: row.message,
    }));
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.chatRepository.deleteBySessionId(sessionId);
  }

  private async appendMessage(sessionId: string, role: ChatRole, content: string): Promise<void> {
    await this.chatRepository.save({
      id: randomUUID(),
      sessionId,
      whoSent: role === ChatRole.USER ? WhoSent.USER : WhoSent.AI,
      message: content,
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
    const rawHistory = await this.getHistory(sessionId);

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

    const systemPrompt = `[필수 규칙] 답변에 이모지(👋📌😊 등)를 절대 사용하지 마세요. 텍스트만 사용하세요.
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

    // *** 에이전트 검색 ***
    const provider = getProvider(aiModel);
    const supportsTools = provider === AIProvider.ANTHROPIC || provider === AIProvider.OPENAI || provider === AIProvider.OLLAMA;
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

      const decision = await this.aiProvider.call(
        aiModel,
        `주제: "${session.topic}". 사용자 질문에 답변하기 위해 최신 정보나 구체적인 데이터가 필요하면 web_search를 호출하세요.`,
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

    // *** 유저 메시지 저장 (검색 결과 포함 — 이후 대화에서 참조 가능) ***
    const persistedUserContent = extraContext
      ? `${message}\n\n[참조한 웹 검색 결과]\n${extraContext}`
      : message;
    await this.appendMessage(sessionId, ChatRole.USER, persistedUserContent);

    // *** Sliding Window: 최근 WINDOW_SIZE개 메시지 + 현재 메시지 ***
    const windowedHistory = (rawHistory as { role: 'user' | 'assistant'; content: string }[])
      .slice(-ChatService.WINDOW_SIZE);
    const streamMessages = [
      ...windowedHistory,
      { role: 'user' as const, content: persistedUserContent },
    ];

    // *** 최종 스트리밍 답변 ***
    const finalSystem = extraContext
      ? `${systemPrompt}\n\n---\n[검색 완료] 위 검색 결과를 바탕으로 답변하세요. "검색할 수 없다"는 응답은 하지 마세요.`
      : systemPrompt;

    let fullResponse = '';
    for await (const chunk of this.aiProvider.stream(aiModel, finalSystem, streamMessages)) {
      fullResponse += chunk;
      yield { type: 'chunk', text: chunk };
    }

    await this.appendMessage(sessionId, ChatRole.ASSISTANT, fullResponse);
  }
}
