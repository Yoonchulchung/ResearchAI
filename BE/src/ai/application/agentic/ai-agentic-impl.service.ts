import { Injectable } from '@nestjs/common';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { getProvider, AIProvider } from 'src/ai/domain/models';
import { InvalidAiTypeException } from 'src/shared/exceptions/invalid-ai-type.exception';

@Injectable()
export class AiAgenticImplService {
  constructor(private readonly aiProvider: AiProviderService) {}

  async runAgenticLoop(
    aiModel: string,
    system: string,
    prompt: string,
    searchFn: (query: string) => Promise<string>,
    maxIterations = 5,
    signal?: AbortSignal,
    extraTools?: { anthropic: object[]; openai: object[] },
    toolHandlers?: Record<
      string,
      (input: unknown) => Promise<{ text: string; data?: unknown }>
    >,
  ): Promise<{
    result: string;
    searchLog: Array<{ query: string; result: string }>;
    toolData: Record<string, unknown[]>;
    inputTokens: number;
    outputTokens: number;
    estimatedFees: number;
  }> {
    const searchLog: Array<{ query: string; result: string }> = [];
    const toolData: Record<string, unknown[]> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedFees = 0;
    const provider = getProvider(aiModel);

    const anthropicWebSearch = {
      name: 'web_search',
      description:
        '웹에서 최신 정보를 검색합니다. 학습 데이터에 없는 최신 정보나 특정 사실 확인이 필요한 경우에만 호출하세요.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색할 쿼리 (영어 권장)' },
        },
        required: ['query'],
      },
    };
    const openaiWebSearch = {
      type: 'function',
      function: {
        name: 'web_search',
        description: anthropicWebSearch.description,
        parameters: anthropicWebSearch.input_schema,
      },
    };

    const tools =
      provider === AIProvider.ANTHROPIC
        ? [anthropicWebSearch, ...(extraTools?.anthropic ?? [])]
        : [openaiWebSearch, ...(extraTools?.openai ?? [])];

    const messages: any[] = [{ role: 'user', content: prompt }];

    for (let i = 0; i < maxIterations; i++) {
      const result = await this.aiProvider.call(aiModel, system, messages, {
        tools,
        signal,
      });
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      estimatedFees += result.estimatedFees;
      if (!result.toolCalls?.length || result.stopReason === 'end_turn') {
        return {
          result: result.text,
          searchLog,
          toolData,
          inputTokens,
          outputTokens,
          estimatedFees,
        };
      }

      if (provider === AIProvider.ANTHROPIC) {
        const content: any[] = [];
        if (result.text) content.push({ type: 'text', text: result.text });
        for (const tc of result.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        messages.push({ role: 'assistant', content });

        const toolResults: any[] = [];
        for (const tc of result.toolCalls) {
          let toolResponse: string;
          if (tc.name === 'web_search') {
            const query = (tc.input as { query: string }).query;
            toolResponse = await searchFn(query);
            searchLog.push({ query, result: toolResponse });
          } else if (toolHandlers?.[tc.name]) {
            const { text, data } = await toolHandlers[tc.name](tc.input);
            toolResponse = text;
            if (data !== undefined) {
              toolData[tc.name] = [...(toolData[tc.name] ?? []), data];
            }
          } else {
            toolResponse = `Unknown tool: ${tc.name}`;
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: toolResponse,
          });
        }
        messages.push({ role: 'user', content: toolResults });
      } else if (
        provider === AIProvider.OPENAI ||
        provider === AIProvider.OLLAMA
      ) {
        messages.push({
          role: 'assistant',
          content: result.text || null,
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        });
        for (const tc of result.toolCalls) {
          let toolResponse: string;
          if (tc.name === 'web_search') {
            const query = (tc.input as { query: string }).query;
            toolResponse = await searchFn(query);
            searchLog.push({ query, result: toolResponse });
          } else if (toolHandlers?.[tc.name]) {
            const { text, data } = await toolHandlers[tc.name](tc.input);
            toolResponse = text;
            if (data !== undefined) {
              toolData[tc.name] = [...(toolData[tc.name] ?? []), data];
            }
          } else {
            toolResponse = `Unknown tool: ${tc.name}`;
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResponse,
          });
        }
      } else {
        throw new InvalidAiTypeException(aiModel);
      }
    }

    const lastAssistant = messages.filter((m) => m.role === 'assistant').at(-1);
    const lastText =
      typeof lastAssistant?.content === 'string'
        ? lastAssistant.content
        : Array.isArray(lastAssistant?.content)
          ? (lastAssistant.content.find((c: any) => c.type === 'text')?.text ??
            '')
          : '';
    return {
      result: lastText,
      searchLog,
      toolData,
      inputTokens,
      outputTokens,
      estimatedFees,
    };
  }
}
