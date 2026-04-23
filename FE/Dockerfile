# syntax=docker/dockerfile:1.6
# --- FE: Next.js 14 (standalone build) ---

# ========== Builder ==========
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Next.js 빌드 (standalone output — next.config.ts에 설정됨)
RUN npm run build

# ========== Runtime ==========
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 -G nodejs

WORKDIR /app

# standalone 번들 + public + static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
