#!/bin/bash

# 종료 시 자식 프로세스 모두 정리
trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM EXIT

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 AI 리서치 시스템 시작 중..."

# ── Qdrant 벡터 DB ───────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q '^qdrant$'; then
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^qdrant$'; then
      echo "🗄️  Qdrant 재시작 중..."
      docker start qdrant >/dev/null
    else
      echo "🗄️  Qdrant 이미 실행 중"
    fi
  else
    echo "🗄️  Qdrant 컨테이너 생성 중..."
    mkdir -p "$ROOT/data/qdrant"
    docker run -d --name qdrant \
      -p 6333:6333 \
      -v "$ROOT/data/qdrant:/qdrant/storage:z" \
      qdrant/qdrant:latest >/dev/null
  fi

  # Qdrant 준비 대기 (최대 15초)
  echo -n "   Qdrant 준비 대기"
  for i in $(seq 1 15); do
    if curl -sf http://localhost:6333/collections >/dev/null 2>&1; then
      echo " ✅"
      break
    fi
    echo -n "."
    sleep 1
  done
else
  echo "⚠️  Docker 미설치 — Qdrant 없이 실행 (벡터 검색 비활성화)"
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
echo "📦 백엔드 시작 (NestJS · http://localhost:3001)"
cd "$ROOT/BE" && pnpm run start:dev &
BE_PID=$!

echo "🌐 프론트엔드 시작 (Next.js · http://localhost:3000)"
cd "$ROOT/FE" && npm run dev &
FE_PID=$!

echo ""
echo "✅ 실행 중 — http://localhost:3000 에서 접속하세요"
echo "   종료하려면 Ctrl+C"
echo ""

wait $BE_PID $FE_PID
