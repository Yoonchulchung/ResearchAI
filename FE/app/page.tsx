"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-md px-8">
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
          🔍
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          AI 리서치 시스템
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          왼쪽 사이드바에서 기존 리서치를 선택하거나,
          <br />새 리서치를 시작해 주제를 심층 분석하세요.
        </p>
        <button
          onClick={() => router.push("/sessions/new")}
          className="bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors text-sm"
        >
          + 새 리서치 시작하기
        </button>
      </div>
    </div>
  );
}
