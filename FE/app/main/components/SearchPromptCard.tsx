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
      <div className="glass-panel p-4 rounded-2xl flex gap-3 items-center shadow-lg">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 2025년 AI 에이전트 기술 트렌드"
          className="flex-1 px-4 py-3 text-sm rounded-xl bg-white/70 border border-slate-200 placeholder-slate-400 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary focus:bg-white transition-all shadow-inner"
        />
        <button
          onClick={handleSearch}
          disabled={!topic.trim()}
          className="bg-brand-primary text-white font-semibold px-6 py-3 rounded-xl text-sm hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-brand-primary/20 shrink-0"
        >
          검색
        </button>
        
      </div>
  );
}
