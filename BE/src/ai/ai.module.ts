import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { AiService } from 'src/ai/application/ai.service';
import { AiAgenticImplService } from 'src/ai/application/agentic/ai-agentic-impl.service';
import { AiTaskImplService } from 'src/ai/application/task/ai-task-impl.service';
import { AiWritingImplService } from 'src/ai/application/writing/ai-writing-impl.service';
import { AiController } from 'src/ai/presentation/ai.controller';
import { SessionsModule } from 'src/sessions/sessions.module';
import { OverviewModule } from 'src/overview/overview.module';
import { AiCallLogEntity } from 'src/ai/domain/entity/ai-call-log.entity';
import { AiCallLogRepository } from 'src/ai/domain/repository/ai-call-log.repository';
import { AiProviderRegistry } from 'src/ai/infrastructure/provider/ai-provider.registry';
import { AnthropicProviderAdapter } from 'src/ai/infrastructure/provider/anthropic/anthropic-provider.adapter';
import { GoogleProviderAdapter } from 'src/ai/infrastructure/provider/google/google-provider.adapter';
import { GroqProviderAdapter } from 'src/ai/infrastructure/provider/groq/groq-provider.adapter';
import { LlamaCppProviderAdapter } from 'src/ai/infrastructure/provider/llama-cpp/llama-cpp-provider.adapter';
import { OllamaProviderAdapter } from 'src/ai/infrastructure/provider/ollama/ollama-provider.adapter';
import { OpenAiProviderAdapter } from 'src/ai/infrastructure/provider/openai/openai-provider.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiCallLogEntity]),
    forwardRef(() => SessionsModule),
    OverviewModule,
  ],
  controllers: [AiController],
  providers: [
    AiProviderService,
    AiService,
    AiAgenticImplService,
    AiTaskImplService,
    AiWritingImplService,
    AiCallLogRepository,
    AiProviderRegistry,
    AnthropicProviderAdapter,
    GoogleProviderAdapter,
    GroqProviderAdapter,
    LlamaCppProviderAdapter,
    OllamaProviderAdapter,
    OpenAiProviderAdapter,
  ],
  exports: [AiProviderService, AiService],
})
export class AiModule {}
