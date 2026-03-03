#!/bin/bash

# 종료 시 자식 프로세스 모두 정리
trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM EXIT

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 AI 리서치 시스템 시작 중..."

# BE 실행
echo "📦 백엔드 시작 (NestJS · http://localhost:3001)"
cd "$ROOT/BE" && pnpm run start:dev &
BE_PID=$!

# FE 실행
echo "🌐 프론트엔드 시작 (Next.js · http://localhost:3000)"
cd "$ROOT/FE" && npm run dev &
FE_PID=$!

echo ""
echo "✅ 실행 중 — http://localhost:3000 에서 접속하세요"
echo "   종료하려면 Ctrl+C"
echo ""

# 두 프로세스 중 하나라도 종료되면 전체 종료
wait $BE_PID $FE_PID
