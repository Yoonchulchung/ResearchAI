import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';

export interface VectorSearchResult {
  text: string;
  taskTitle: string;
  score: number;
}

export interface ExperienceSearchResult {
  experienceId: string;
  title: string;
  text: string;
  score: number;
}

export interface DocumentChunkResult {
  fileId: string;
  filename: string;
  fileType: string;
  text: string;
  chunkIndex: number;
  score: number;
}

@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private readonly qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:6333';
  private readonly collectionName = 'research_rag';
  private readonly experienceCollectionName = 'experience_rag';
  private readonly documentCollectionName = 'document_rag';
  private readonly embedModel =
    process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
  private readonly ollamaUrl =
    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  private readonly vectorSize = 768;

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
      await this.ensureExperienceCollection();
      await this.ensureDocumentCollection();
      this.available = true;
      this.logger.log('✅ Qdrant 연결 성공 — 벡터 검색 활성화');
    } catch (e: any) {
      this.logger.warn(`⚠️  Qdrant 연결 실패 — 벡터 검색 비활성화 (${e.message})`);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  // ── 컬렉션 관리 ──────────────────────────────────────────────────────────────

  private async ensureCollection(): Promise<void> {
    const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`);
    if (res.status === 404) {
      const createRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vectors: { size: this.vectorSize, distance: 'Cosine' } }),
      });
      if (!createRes.ok) throw new Error('컬렉션 생성 실패');
      this.logger.log(`컬렉션 '${this.collectionName}' 생성됨`);
    }
  }

  private async ensureExperienceCollection(): Promise<void> {
    const res = await fetch(`${this.qdrantUrl}/collections/${this.experienceCollectionName}`);
    if (res.status === 404) {
      const createRes = await fetch(`${this.qdrantUrl}/collections/${this.experienceCollectionName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vectors: { size: this.vectorSize, distance: 'Cosine' } }),
      });
      if (!createRes.ok) throw new Error('경험 컬렉션 생성 실패');
      this.logger.log(`컬렉션 '${this.experienceCollectionName}' 생성됨`);
    }
  }

  private async ensureDocumentCollection(): Promise<void> {
    const res = await fetch(`${this.qdrantUrl}/collections/${this.documentCollectionName}`);
    if (res.status === 404) {
      const createRes = await fetch(`${this.qdrantUrl}/collections/${this.documentCollectionName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vectors: { size: this.vectorSize, distance: 'Cosine' } }),
      });
      if (!createRes.ok) throw new Error('문서 컬렉션 생성 실패');
      this.logger.log(`컬렉션 '${this.documentCollectionName}' 생성됨`);
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

  // ── userId 필터 헬퍼 ──────────────────────────────────────────────────────────

  private userIdFilter(userId: string | null | undefined) {
    if (!userId) return null;
    return { key: 'userId', match: { value: userId } };
  }

  // ── Research RAG 인덱싱 / 검색 ──────────────────────────────────────────────

  async indexTaskResult(
    sessionId: string,
    taskId: string,
    taskTitle: string,
    content: string,
    userId?: string | null,
  ): Promise<void> {
    if (!this.available) return;
    try {
      await this.deleteByFilter({ sessionId, taskId });

      const chunks = this.chunkText(content);
      const points: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const vector = await this.embed(chunks[i]);
        points.push({
          id: this.toUUID(`${sessionId}_${taskId}_${i}`),
          vector,
          payload: { sessionId, taskId, taskTitle, chunkIndex: i, text: chunks[i], userId: userId ?? null },
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

  async search(
    sessionId: string,
    query: string,
    topK = 6,
    userId?: string | null,
  ): Promise<VectorSearchResult[]> {
    if (!this.available) return [];
    try {
      const queryVector = await this.embed(query);
      const must: any[] = [{ key: 'sessionId', match: { value: sessionId } }];
      const userFilter = this.userIdFilter(userId);
      if (userFilter) must.push(userFilter);

      const res = await fetch(
        `${this.qdrantUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryVector,
            limit: topK,
            score_threshold: 0.3,
            filter: { must },
            with_payload: true,
          }),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return (data.result ?? []).map((r: any) => ({
        text: r.payload.text,
        taskTitle: r.payload.taskTitle,
        score: r.score,
      }));
    } catch {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.available) return;
    await this.deleteByFilter({ sessionId }).catch(() => {});
  }

  // ── Experience RAG 인덱싱 / 검색 ────────────────────────────────────────────

  async indexExperience(
    experienceId: string,
    title: string,
    content: string,
    userId?: string | null,
  ): Promise<void> {
    if (!this.available) return;
    try {
      await this.deleteExperienceFromIndex(experienceId);
      const chunks = this.chunkText(`${title}\n\n${content}`);
      const points: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const vector = await this.embed(chunks[i]);
        points.push({
          id: this.toUUID(`exp_${experienceId}_${i}`),
          vector,
          payload: { experienceId, title, chunkIndex: i, text: chunks[i], userId: userId ?? null },
        });
      }
      if (points.length === 0) return;
      await fetch(
        `${this.qdrantUrl}/collections/${this.experienceCollectionName}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        },
      );
    } catch (e: any) {
      this.logger.error(`경험 인덱싱 오류 [${title}]: ${e.message}`);
    }
  }

  async searchExperiences(
    query: string,
    topK = 5,
    userId?: string | null,
  ): Promise<ExperienceSearchResult[]> {
    if (!this.available) return [];
    try {
      const queryVector = await this.embed(query);
      const must: any[] = [];
      const userFilter = this.userIdFilter(userId);
      if (userFilter) must.push(userFilter);

      const res = await fetch(
        `${this.qdrantUrl}/collections/${this.experienceCollectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryVector,
            limit: topK * 2,
            score_threshold: 0.2,
            ...(must.length > 0 ? { filter: { must } } : {}),
            with_payload: true,
          }),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      const seen = new Map<string, ExperienceSearchResult>();
      for (const r of data.result ?? []) {
        const id = r.payload.experienceId;
        if (!seen.has(id) || seen.get(id)!.score < r.score) {
          seen.set(id, { experienceId: id, title: r.payload.title, text: r.payload.text, score: r.score });
        }
      }
      return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, topK);
    } catch {
      return [];
    }
  }

  // ── Document RAG 인덱싱 / 검색 ──────────────────────────────────────────────

  async indexDocument(
    fileId: string,
    filename: string,
    fileType: string,
    text: string,
    userId?: string | null,
  ): Promise<void> {
    if (!this.available) return;
    try {
      await this.deleteDocumentFromIndex(fileId);
      const chunks = this.chunkText(text);
      const points: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const vector = await this.embed(chunks[i]);
        points.push({
          id: this.toUUID(`doc_${fileId}_${i}`),
          vector,
          payload: { fileId, filename, fileType, chunkIndex: i, text: chunks[i], userId: userId ?? null },
        });
      }
      if (points.length === 0) return;
      await fetch(
        `${this.qdrantUrl}/collections/${this.documentCollectionName}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        },
      );
      this.logger.log(`문서 인덱싱 완료: ${filename} (${chunks.length}청크)`);
    } catch (e: any) {
      this.logger.error(`문서 인덱싱 오류 [${filename}]: ${e.message}`);
    }
  }

  async searchDocuments(
    query: string,
    fileIds?: string[],
    topK = 4,
    userId?: string | null,
  ): Promise<DocumentChunkResult[]> {
    if (!this.available) return [];
    try {
      const queryVector = await this.embed(query);
      const must: any[] = [];
      if (fileIds?.length) must.push({ key: 'fileId', match: { any: fileIds } });
      const userFilter = this.userIdFilter(userId);
      if (userFilter) must.push(userFilter);

      const res = await fetch(
        `${this.qdrantUrl}/collections/${this.documentCollectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryVector,
            limit: topK,
            score_threshold: 0.3,
            ...(must.length > 0 ? { filter: { must } } : {}),
            with_payload: true,
          }),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return (data.result ?? []).map((r: any) => ({
        fileId: r.payload.fileId,
        filename: r.payload.filename,
        fileType: r.payload.fileType,
        text: r.payload.text,
        chunkIndex: r.payload.chunkIndex,
        score: r.score,
      }));
    } catch {
      return [];
    }
  }

  async deleteDocument(fileId: string): Promise<void> {
    if (!this.available) return;
    await this.deleteDocumentFromIndex(fileId).catch(() => {});
  }

  async deleteDocuments(fileIds: string[]): Promise<void> {
    if (!this.available || fileIds.length === 0) return;
    await fetch(
      `${this.qdrantUrl}/collections/${this.documentCollectionName}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { must: [{ key: 'fileId', match: { any: fileIds } }] } }),
      },
    ).catch(() => {});
  }

  async deleteExperience(experienceId: string): Promise<void> {
    if (!this.available) return;
    await this.deleteExperienceFromIndex(experienceId).catch(() => {});
  }

  private async deleteDocumentFromIndex(fileId: string): Promise<void> {
    await fetch(
      `${this.qdrantUrl}/collections/${this.documentCollectionName}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { must: [{ key: 'fileId', match: { value: fileId } }] } }),
      },
    );
  }

  private async deleteExperienceFromIndex(experienceId: string): Promise<void> {
    await fetch(
      `${this.qdrantUrl}/collections/${this.experienceCollectionName}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { must: [{ key: 'experienceId', match: { value: experienceId } }] } }),
      },
    );
  }

  private async deleteByFilter(filter: Record<string, string>): Promise<void> {
    const must = Object.entries(filter).map(([key, value]) => ({ key, match: { value } }));
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
