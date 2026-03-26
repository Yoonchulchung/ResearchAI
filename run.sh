#!/bin/bash

# 종료 시 자식 프로세스 모두 정리
trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM EXIT

ROOT="$(cd "$(dirname "$0")" && pwd)"

MODE="${1:-prod}"
if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
  echo "사용법: $0 [dev|prod]"
  exit 1
fi

echo "🚀 AI 리서치 시스템 시작 중... (${MODE} 모드)"

# ── Qdrant 벡터 DB ───────────────────────────────────────────────────────────
QDRANT_BIN="$ROOT/data/qdrant-bin/qdrant"
QDRANT_PID=""

_start_qdrant() {
  mkdir -p "$ROOT/data/qdrant"
  QDRANT__STORAGE__STORAGE_PATH="$ROOT/data/qdrant" "$QDRANT_BIN" &>/dev/null &
  QDRANT_PID=$!
  echo -n "   Qdrant 준비 대기"
  for i in $(seq 1 15); do
    if curl -sf http://localhost:6333/collections >/dev/null 2>&1; then
      echo " ✅"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  echo " ⚠️  타임아웃"
}

if curl -sf http://localhost:6333/collections >/dev/null 2>&1; then
  echo "🗄️  Qdrant 이미 실행 중"
elif [ -f "$QDRANT_BIN" ]; then
  echo "🗄️  Qdrant 시작 중..."
  _start_qdrant
else
  echo "🗄️  Qdrant 바이너리 다운로드 중..."
  mkdir -p "$ROOT/data/qdrant-bin"
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    QDRANT_URL="https://github.com/qdrant/qdrant/releases/latest/download/qdrant-aarch64-apple-darwin.tar.gz"
  else
    QDRANT_URL="https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-apple-darwin.tar.gz"
  fi
  if curl -fL "$QDRANT_URL" | tar xz -C "$ROOT/data/qdrant-bin"; then
    chmod +x "$QDRANT_BIN"
    echo "🗄️  Qdrant 시작 중..."
    _start_qdrant
  else
    echo "⚠️  Qdrant 다운로드 실패 — 벡터 검색 비활성화"
  fi
fi

# ── Ollama 서버 ──────────────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
  if ! curl -sf http://localhost:11434 >/dev/null 2>&1; then
    echo "🦙 Ollama 서버 시작 중..."
    ollama serve &>/dev/null &
    # 준비 대기 (최대 10초)
    for i in $(seq 1 10); do
      if curl -sf http://localhost:11434 >/dev/null 2>&1; then break; fi
      sleep 1
    done
    echo "🦙 Ollama 서버 실행 중"
  else
    echo "🦙 Ollama 이미 실행 중"
  fi

  # ── 임베딩 모델 (nomic-embed-text) ─────────────────────────────────────────
  if ! ollama list 2>/dev/null | grep -q 'nomic-embed-text'; then
    echo "⬇️  임베딩 모델 다운로드 중 (nomic-embed-text, 약 274MB)..."
    ollama pull nomic-embed-text
  else
    echo "📊 임베딩 모델 준비됨 (nomic-embed-text)"
  fi
else
  echo "⚠️  Ollama 미설치 — Ollama 및 임베딩 비활성화"
fi

# ── 의존성 설치 ──────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/BE/node_modules" ]; then
  echo "📦 BE node_modules 설치 중..."
  cd "$ROOT/BE" && pnpm install
fi

if [ ! -d "$ROOT/FE/node_modules" ]; then
  echo "📦 FE node_modules 설치 중..."
  cd "$ROOT/FE" && npm install
fi

# ── 서버 실행 ────────────────────────────────────────────────────────────────
if [ "$MODE" = "dev" ]; then
  echo "📦 백엔드 시작 (NestJS · http://localhost:3001)"
  cd "$ROOT/BE" && pnpm run start:dev &
  BE_PID=$!

  echo "🌐 프론트엔드 시작 (Next.js · http://localhost:3000)"
  cd "$ROOT/FE" && npm run dev &
  FE_PID=$!
else
  echo "📦 백엔드 빌드 중..."
  cd "$ROOT/BE" && pnpm run build

  echo "📦 백엔드 시작 (NestJS · http://localhost:3001)"
  node "$ROOT/BE/dist/main" &
  BE_PID=$!

  echo "🌐 프론트엔드 빌드 중..."
  cd "$ROOT/FE" && npm run build

  echo "🌐 프론트엔드 시작 (Next.js · http://localhost:3000)"
  cd "$ROOT/FE" && node_modules/.bin/next start &
  FE_PID=$!
fi

echo ""
echo "✅ 실행 중 — http://localhost:3000 에서 접속하세요"
echo "   종료하려면 Ctrl+C"
echo ""

wait $BE_PID $FE_PID ${QDRANT_PID}
