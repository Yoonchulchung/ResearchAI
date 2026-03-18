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
  async *chatStream(
    sessionId: string,
    message: string,
    aiModel: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const session = await this.sessionsService.findOne(sessionId);

    await this.appendMessage(sessionId, ChatRole.USER, message);
    const history = await this.getHistory(sessionId);

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


    // streaming call용: 도구 언급 없이 답변만
    const answerSystem = `[필수 규칙] 답변에 이모지(👋📌😊 등)를 절대 사용하지 마세요. 텍스트만 사용하세요.

당신은 "${session.topic}" 분야의 시니어 리서치 애널리스트입니다.

답변 원칙:
- 결론부터 말하고, 이유와 근거를 이어서 서술하세요.
- "~로 보입니다", "~것으로 판단됩니다" 같은 AI 특유의 단어 사용을 피하세요.
- 단순 나열 대신 흐름 있는 문장으로 서술하세요.
- 한국어로 작성하세요.

## 리서치 결과
${ragContext}`;

    const historyMessages = history as { role: 'user' | 'assistant'; content: string }[];

    // *** 에이전트 검색 (Anthropic / OpenAI 만 지원) ***
    const provider = getProvider(aiModel);
    const supportsTools = provider === AIProvider.ANTHROPIC || provider === AIProvider.OPENAI;
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

      // 최신 메시지만 전달 — RAG 데이터 없이 순수하게 "검색 필요 여부"만 판단
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
          const raw = await this.webSearchService.searchByEngine(SearchEngine.DUCKDUCKGO, query, aiModel);
          if (raw) parts.push(`### 검색: ${query}\n${raw}`);
        }
        if (parts.length > 0) {
          extraContext = parts.join('\n\n---\n\n');
        }
      }
    }

    // *** 최종 스트리밍 답변 ***
    const finalSystem = extraContext
      ? `${answerSystem}\n\n---\n[검색 완료] 아래 웹 검색 결과를 바탕으로 구체적으로 답변하세요. "검색할 수 없다"는 응답은 절대 하지 마세요.\n\n## 웹 검색 결과\n${extraContext}`
      : answerSystem;

    // 검색 결과가 있을 때: 마지막 유저 메시지에 결과를 붙여서 히스토리 오염을 차단
    const streamMessages = extraContext
      ? [
          ...historyMessages.slice(0, -1),
          {
            role: 'user' as const,
            content: `${historyMessages[historyMessages.length - 1].content}\n\n[웹 검색 결과]\n${extraContext}`,
          },
        ]
      : historyMessages;

    let fullResponse = '';
    for await (const chunk of this.aiProvider.stream(aiModel, finalSystem, streamMessages)) {
      fullResponse += chunk;
      yield { type: 'chunk', text: chunk };
    }

    await this.appendMessage(sessionId, ChatRole.ASSISTANT, fullResponse);
  }
}
