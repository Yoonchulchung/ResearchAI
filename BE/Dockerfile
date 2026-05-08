# --- BE: NestJS (pnpm) ---

# ========== Builder ==========
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# pnpm 활성화
RUN corepack enable && corepack prepare pnpm@latest --activate

# 의존성 캐시 최적화 (Puppeteer 번들 Chrome 다운로드 스킵 — ARM에서 미지원)
COPY package.json pnpm-lock.yaml* ./
RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --frozen-lockfile=false

# 소스 복사 + 빌드
COPY . .
RUN pnpm run build \
 && pnpm prune --prod

# ========== Runtime ==========
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini dumb-init chromium \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# SQLite·미디어·Qdrant 데이터 볼륨
RUN mkdir -p /app/data /app/media && chown -R nestjs:nodejs /app/data /app/media

USER nestjs

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_URL=file:/app/data/sessions.db \
    MEDIA_PATH=/app/media \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_DOWNLOAD=true

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
