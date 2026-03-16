"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchPromptCard() {
  const router = useRouter();
  const [topic, setTopic] = useState("");

  const handleSearch = () => {
    if (!topic.trim()) return;
    router.push(`/main/search?q=${encodeURIComponent(topic.trim())}`);
  };

  const handleStart = () => {
    if (!topic.trim()) return;
    sessionStorage.setItem("dashboard-topic", topic.trim());
    router.push("/sessions/new");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (      
      <div className="flex gap-2">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 2025년 AI 에이전트 기술 트렌드"
          className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-white border border-slate-300 placeholder-slate-400 text-slate-800 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400"
        />
        <button
          onClick={handleSearch}
          disabled={!topic.trim()}
          className="bg-gray-400 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          검색
        </button>
        
      </div>
  );
}
