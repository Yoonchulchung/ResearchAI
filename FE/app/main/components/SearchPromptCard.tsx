"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchPromptCard() {
  const router = useRouter();
  const [topic, setTopic] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    sessionStorage.setItem("dashboard-topic", topic.trim());
    router.push("/sessions/new");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">🔍</span>
        <h2 className="text-base font-bold">새 리서치 시작</h2>
      </div>
      <p className="text-indigo-200 text-xs mb-4">
        조사할 주제를 입력하면 AI가 항목을 자동 생성합니다
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 2025년 AI 에이전트 기술 트렌드"
          className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-white/10 border border-white/20 placeholder-indigo-300 text-white focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40 backdrop-blur-sm"
        />
        <button
          type="submit"
          disabled={!topic.trim()}
          className="bg-white text-indigo-700 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          시작하기
        </button>
      </form>
    </div>
  );
}
