import { Controller, Post, Body } from '@nestjs/common';
import { VectorService } from './vector.service';

@Controller('vector')
export class VectorController {
  constructor(private readonly vectorService: VectorService) {}

  /** RAG 검색 품질 디버깅 — 3개 컬렉션 모두 검색 */
  @Post('debug')
  async debug(
    @Body() body: { query: string; sessionId?: string; topK?: number },
  ) {
    const { query, sessionId, topK = 5 } = body;

    const [research, experiences, documents] = await Promise.all([
      sessionId
        ? this.vectorService.search(sessionId, query, topK)
        : Promise.resolve([]),
      this.vectorService.searchExperiences(query, topK),
      this.vectorService.searchDocuments(query, undefined, topK),
    ]);

    return {
      query,
      collections: {
        research_rag: research.map((r) => ({
          score: r.score,
          taskTitle: r.taskTitle,
          text: r.text,
        })),
        experience_rag: experiences.map((r) => ({
          score: r.score,
          title: r.title,
          text: r.text,
        })),
        document_rag: documents.map((r) => ({
          score: r.score,
          filename: r.filename,
          fileType: r.fileType,
          chunkIndex: r.chunkIndex,
          text: r.text,
        })),
      },
    };
  }
}
