import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';

export interface VectorSearchResult {
  text: string;
  taskTitle: string;
  taskIcon: string;
  score: number;
}

@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private readonly qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:6333';
  private readonly collectionName = 'research_rag';
  private readonly embedModel =
    process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
  private readonly ollamaUrl =
    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  private readonly vectorSize = 768; // nomic-embed-text 기본 차원

  private available = false;

  async onModuleInit() {
    await this.init();
  }

  private async init() {
    try {
      const res = await fetch(`${this.qdrantUrl}/collections`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.ensureCollection();
      this.available = true;
      this.logger.log('✅ Qdrant 연결 성공 — 벡터 검색 활성화');
    } catch (e: any) {
      this.logger.warn(
        `⚠️  Qdrant 연결 실패 — 벡터 검색 비활성화 (${e.message})`,
      );
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  // ── 컬렉션 관리 ─────────────────────────────────────────────────────────────

  private async ensureCollection(): Promise<void> {
    const res = await fetch(
      `${this.qdrantUrl}/collections/${this.collectionName}`,
    );
    if (res.status === 404) {
      const createRes = await fetch(
        `${this.qdrantUrl}/collections/${this.collectionName}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: { size: this.vectorSize, distance: 'Cosine' },
          }),
        },
      );
      if (!createRes.ok) throw new Error('컬렉션 생성 실패');
      this.logger.log(`컬렉션 '${this.collectionName}' 생성됨`);
    }
  }

  // ── 임베딩 ───────────────────────────────────────────────────────────────────

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, input: text }),
    });
    if (!res.ok) throw new Error(`임베딩 실패: ${res.status}`);
    const data = (await res.json()) as any;
    return data.embeddings[0];
  }

  // ── 청킹 ─────────────────────────────────────────────────────────────────────

  private chunkText(text: string, size = 600, overlap = 80): string[] {
    if (text.length <= size) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      if (start + size >= text.length) break;
      start += size - overlap;
    }
    return chunks;
  }

  // ── ID 생성 ───────────────────────────────────────────────────────────────────

  private toUUID(s: string): string {
    const h = createHash('md5').update(s).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

  // ── 인덱싱 ───────────────────────────────────────────────────────────────────

  async indexTaskResult(
    sessionId: string,
    taskId: string,
    taskTitle: string,
    taskIcon: string,
    content: string,
  ): Promise<void> {
    if (!this.available) return;
    try {
      // 기존 벡터 삭제 후 재인덱싱
      await this.deleteByFilter({ sessionId, taskId });

      const chunks = this.chunkText(content);
      const points: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const vector = await this.embed(chunks[i]);
        points.push({
          id: this.toUUID(`${sessionId}_${taskId}_${i}`),
          vector,
          payload: {
            sessionId,
            taskId,
            taskTitle,
            taskIcon,
            chunkIndex: i,
            text: chunks[i],
          },
        });
      }

      if (points.length === 0) return;

      const upsertRes = await fetch(
        `${this.qdrantUrl}/collections/${this.collectionName}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        },
      );

      if (!upsertRes.ok) {
        const err = await upsertRes.text();
        this.logger.error(`인덱싱 실패 [${taskTitle}]: ${err}`);
      }
    } catch (e: any) {
      this.logger.error(`인덱싱 오류 [${taskTitle}]: ${e.message}`);
    }
  }

  // ── 벡터 검색 ────────────────────────────────────────────────────────────────

  async search(
    sessionId: string,
    query: string,
    topK = 6,
  ): Promise<VectorSearchResult[]> {
    if (!this.available) return [];
    try {
      const queryVector = await this.embed(query);
      const res = await fetch(
        `${this.qdrantUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryVector,
            limit: topK,
            score_threshold: 0.3,
            filter: {
              must: [{ key: 'sessionId', match: { value: sessionId } }],
            },
            with_payload: true,
          }),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return (data.result ?? []).map((r: any) => ({
        text: r.payload.text,
        taskTitle: r.payload.taskTitle,
        taskIcon: r.payload.taskIcon,
        score: r.score,
      }));
    } catch {
      return [];
    }
  }

  // ── 정리 ─────────────────────────────────────────────────────────────────────

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.available) return;
    await this.deleteByFilter({ sessionId }).catch(() => {});
  }

  private async deleteByFilter(
    filter: Record<string, string>,
  ): Promise<void> {
    const must = Object.entries(filter).map(([key, value]) => ({
      key,
      match: { value },
    }));
    await fetch(
      `${this.qdrantUrl}/collections/${this.collectionName}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { must } }),
      },
    );
  }
}
