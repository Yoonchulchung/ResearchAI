// import { Injectable } from '@nestjs/common';
// import { SessionsService } from '../../sessions/application/sessions.service';
// import { CompactedEntry } from '../domain/chat-message.model';

// @Injectable()
// export class ContextCompactorService {
//   private compactedContexts = new Map<string, CompactedEntry>();
//   private compactionQueue = new Set<string>();

//   constructor(private readonly sessionsService: SessionsService) {}

//   getStatus(sessionId: string): { status: 'idle' | 'running' | 'done'; compactedAt?: Date } {
//     if (this.compactionQueue.has(sessionId)) return { status: 'running' };
//     const cached = this.compactedContexts.get(sessionId);
//     if (cached) return { status: 'done', compactedAt: cached.compactedAt };
//     return { status: 'idle' };
//   }

//   getCached(sessionId: string): CompactedEntry | undefined {
//     return this.compactedContexts.get(sessionId);
//   }


//   schedule(sessionId: string): void {
//     if (this.compactionQueue.has(sessionId)) return;
//     let ragParts: string[];
//     try {
//       ragParts = this.buildRagParts(sessionId);
//     } catch {
//       return;
//     }
//     if (ragParts.length === 0) return;

//     const hash = this.computeHash(ragParts);
//     const cached = this.compactedContexts.get(sessionId);
//     if (cached?.hash === hash) return;

//     this.compactionQueue.add(sessionId);
//     this.run(sessionId, ragParts.join('\n\n---\n\n'), hash).catch(() => {});
//   }

//   buildRagParts(sessionId: string): string[] {
//     const session = this.sessionsService.findOne(sessionId);
//     return (session.tasks ?? [])
//       .filter((t) => session.results?.[t.id])
//       .map((t) => `### ${t.icon} ${t.title}\n${session.results[t.id]}`);
//   }

//   computeHash(ragParts: string[]): string {
//     return ragParts.map((p) => p.length).join(',') + `|${ragParts.length}`;
//   }

//   private async run(sessionId: string, rawContext: string, hash: string): Promise<void> {
//     const ollamaModel = process.env.OLLAMA_COMPRESS_MODEL ?? 'llama3.1';
//     const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
//     try {
//       const res = await fetch(`${ollamaUrl}/api/chat`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           model: ollamaModel,
//           stream: false,
//           messages: [
//             {
//               role: 'system',
//               content:
//                 '당신은 리서치 문서를 압축하는 전문가입니다. 핵심 정보, 수치, 결론, 인사이트를 빠짐없이 보존하면서 문서를 간결하게 요약하세요.',
//             },
//             {
//               role: 'user',
//               content: `아래 리서치 결과를 압축해주세요.\n- 중요 데이터, 수치, 결론은 반드시 보존\n- 반복되는 내용 제거\n- 섹션 구조 유지\n- 원문 언어 유지\n\n## 리서치 결과\n${rawContext}`,
//             },
//           ],
//         }),
//       });
//       if (res.ok) {
//         const data = (await res.json()) as any;
//         const compressed = data.message?.content ?? '';
//         if (compressed) {
//           this.compactedContexts.set(sessionId, { text: compressed, hash, compactedAt: new Date() });
//         }
//       }
//     } catch {
//       // 압축 실패 시 무시, 다음 호출 시 재시도
//     } finally {
//       this.compactionQueue.delete(sessionId);
//     }
//   }
// }
