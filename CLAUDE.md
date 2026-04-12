# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Start everything (recommended)
```bash
./run.sh dev    # Starts Qdrant, Ollama, BE (port 3001), FE (port 3000) — dev/watch mode
./run.sh prod   # Build and start in production mode
```

### Backend (BE/) — uses pnpm
```bash
pnpm run start:dev   # Watch mode (recommended for development)
pnpm run build       # Compile TypeScript
pnpm run lint        # ESLint with auto-fix
pnpm run test        # Jest unit tests
pnpm run test:e2e    # End-to-end tests
```

### Frontend (FE/) — uses npm
```bash
npm run dev    # Next.js dev server
npm run build  # Production build
npm run lint   # ESLint
```

## Architecture Overview

Two separate apps — a **NestJS backend** (port 3001) and a **Next.js 14 frontend** (port 3000) — with three external services: SQLite (embedded), Qdrant (vector DB, port 6333), Ollama (local AI, port 11434).

### Frontend → Backend communication
- **HTTP REST**: All data fetching via `FE/app/lib/api/` modules (`sessions.ts`, `research.ts`, `chat.ts`, etc.)
- **SSE**: Real-time research job progress → `GET /queue/research/light/{id}/stream`
- **WebSocket**: `ws://localhost:3001/ws` — subscribe to session/queue updates; gateway is in `BE/src/sessions/presentation/sessions.gateway.ts`

### Backend module structure (DDD)

Each major feature module follows 4 layers:
```
src/{module}/
  domain/          # Entities (TypeORM), Repository interfaces, domain models, AI prompts
  application/     # Business logic services, pipeline orchestration
  infrastructure/  # External API clients, provider implementations
  presentation/    # Controllers (HTTP), Gateways (WebSocket), request/response DTOs
```

Key modules:
- **`ai/`** — Multi-provider AI abstraction. `AiProviderService` routes to Anthropic/OpenAI/Google/Ollama. `AiService` contains the agentic loop (tool_use / function_calling). Model IDs in `domain/models.ts` — prefix determines provider: `claude-*` → Anthropic, `gemini-*` → Google, `ollama:*` → Ollama, else → OpenAI.
- **`research/`** — Light and Deep research pipelines. `LightResearchPipelineService` plans search strategy, runs parallel multi-engine web search, generates tasks. `DeepResearchPipelineService` executes each task via agentic loop.
- **`queue/`** — Background job queue. Executors (`LightResearchExecutor`, `DeepResearchExecutor`, etc.) run jobs and stream progress via SSE + WebSocket.
- **`chat/`** — RAG chat. Queries Qdrant `research_rag`/`experience_rag`/`document_rag` collections, then calls AI with retrieved context.
- **`sessions/`** — Session/task persistence + WebSocket gateway.
- **`documents/`** — Markdown document storage + experience extraction (auto-parsed from docs).
- **`vector/`** — Qdrant wrapper; `VectorService` embeds text via Ollama's `nomic-embed-text` and upserts/searches collections.
- **`media/`** — File uploads; PDF/DOCX parsed to text on upload (returned as `{ fileId, text, pageCount }`).

### Database
- **SQLite** (`data/sessions.db`) via TypeORM with `synchronize: true` — no migrations needed, schema auto-updates on start.
- **Qdrant** (`data/qdrant/`) — 3 collections: `research_rag`, `experience_rag`, `document_rag`.

### Frontend structure

```
FE/app/
  main/              # Research home — TopicInput + session list
  sessions/[id]/     # Session detail — tasks, deep research results, chat
  doc-write/         # Markdown editor (EditorPanel + AiPanel)
  doc-store/         # Saved documents + experience cards
  settings/
    pipeline/        # Dev/debug panels: pipeline test, doc parse, RAG debug, AI call logs
    ...
  components/
    TopicInput/      # Folder-split component: types, hooks (useFileUpload), sub-components
  lib/api/           # All fetch wrappers (one file per domain)
  contexts/          # ThemeContext, SidebarContext, etc.
```

Theme/UI pattern: `isDark = theme === "dark"` (never `|| uiStyle === "glass"`). Glass mode (`uiStyle === "glass"`) is a separate dimension — always check both independently for styling.

### PDF / document attachment flow
PDFs are handled Claude-style (direct text injection, not RAG): parse on upload → store `{ filename, text }` → send with each chat message in `attachedTexts[]` field → `ChatService` injects text directly into the AI context.

### AI call logging
Every `AiProviderService.call()` invocation saves to `ai_call_log` table (system prompt, user prompt, response, tokens, fees, duration, error). Viewable at `/settings/pipeline` → "AI 호출 이력" tab.

## Environment

Backend requires `BE/.env`. Minimum for cloud AI (at least one):
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
```

Optional search APIs (parallel multi-search):
```
TAVILY_API_KEY=      # Recommended — AI-optimized
SERPER_API_KEY=
NAVER_CLIENT_ID= / NAVER_CLIENT_SECRET=
BRAVE_API_KEY=
```

Optional local AI:
```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text   # Required for RAG/vector features
```
