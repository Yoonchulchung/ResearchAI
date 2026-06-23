"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { getYoutubeLive, type YoutubeNewsItem } from "@/lib/api/news-feed";

function PlayerModal({
  initial,
  all,
  isDark,
  onClose,
}: {
  initial: YoutubeNewsItem;
  all: YoutubeNewsItem[];
  isDark: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initial);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const others = all.filter((i) => i.videoId !== current.videoId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative flex w-[min(1280px,95vw)] rounded-2xl overflow-hidden shadow-2xl border ${
          isDark ? "border-white/10 bg-zinc-900" : "border-slate-200 bg-white"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {/* 왼쪽: 플레이어 */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="aspect-video w-full bg-black">
            <iframe
              key={current.videoId}
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${current.videoId}?autoplay=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={`shrink-0 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
              isDark ? "bg-red-500/20 text-red-300" : "bg-red-50 text-red-600"
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {current.source}
            </span>
            <a
              href={current.link}
              target="_blank"
              rel="noreferrer"
              className={`line-clamp-1 text-sm font-semibold hover:text-red-500 transition ${
                isDark ? "text-white/85" : "text-slate-800"
              }`}
            >
              {current.title}
            </a>
          </div>
        </div>

        {/* 오른쪽: 채널 목록 */}
        <div className={`w-64 shrink-0 flex flex-col border-l ${
          isDark ? "border-white/10 bg-black/30" : "border-slate-100 bg-slate-50"
        }`}>
          <p className={`px-4 py-3 text-sm font-bold tracking-wide uppercase ${
            isDark ? "text-white/40" : "text-slate-400"
          }`}>다른 채널</p>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {others.map((ch) => (
              <button
                key={ch.videoId}
                onClick={() => setCurrent(ch)}
                className={`flex flex-col overflow-hidden rounded-lg border text-left transition hover:border-red-400/50 ${
                  isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-red-50/50"
                }`}
              >
                <div className="relative aspect-video w-full bg-black overflow-hidden">
                  <img
                    src={ch.thumbnailUrl}
                    alt={ch.title}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${ch.videoId}/hqdefault.jpg`;
                    }}
                  />
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded px-1 py-0.5 bg-red-600">
                    <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                    <span className="text-2xs font-bold text-white">LIVE</span>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <span className={`text-xs font-bold ${isDark ? "text-red-300" : "text-red-600"}`}>
                    {ch.source}
                  </span>
                  <p className={`mt-1 line-clamp-2 text-xs leading-snug ${
                    isDark ? "text-white/70" : "text-slate-700"
                  }`}>
                    {ch.title}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveCard({
  item,
  all,
  isDark,
}: {
  item: YoutubeNewsItem;
  all: YoutubeNewsItem[];
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <PlayerModal initial={item} all={all} isDark={isDark} onClose={() => setOpen(false)} />}

      <div
        className={`flex-none w-64 flex flex-col overflow-hidden rounded-xl border transition hover:border-red-400/40 ${
          isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white shadow-sm"
        }`}
      >
        <div
          className="relative aspect-video w-full cursor-pointer overflow-hidden bg-black group"
          onClick={() => setOpen(true)}
        >
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-75"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
            }}
          />
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded px-1.5 py-0.5 bg-red-600 shadow">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-2xs font-bold text-white tracking-wide">LIVE</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/90 shadow-lg transition group-hover:scale-110 group-hover:bg-red-500">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <polygon points="7,4 17,10 7,16" fill="white" />
              </svg>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold ${
              isDark ? "bg-red-500/20 text-red-300" : "bg-red-50 text-red-600"
            }`}
          >
            {item.source}
          </span>
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className={`line-clamp-1 text-xs font-semibold transition hover:text-red-500 ${
              isDark ? "text-white/80" : "text-slate-800"
            }`}
          >
            {item.title}
          </a>
        </div>
      </div>
    </>
  );
}

function SkeletonCard({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-white/10" : "bg-slate-100";
  return (
    <div
      className={`flex-none w-64 overflow-hidden rounded-xl border ${
        isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`aspect-video w-full animate-pulse ${pulse}`} />
      <div className="flex items-center gap-2 px-3 py-2">
        <div className={`h-4 w-14 animate-pulse rounded ${pulse}`} />
        <div className={`h-3 flex-1 animate-pulse rounded ${pulse}`} />
      </div>
    </div>
  );
}

export function YoutubeSection() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [items, setItems] = useState<YoutubeNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getYoutubeLive()
      .then((data) => setItems(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "right" ? 280 : -280, behavior: "smooth" });
  };

  return (
    <div className="glass-panel rounded-2xl p-5">
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <h2 className={`text-sm font-bold ${isDark ? "text-white/85" : "text-slate-700"}`}>
            뉴스 라이브
          </h2>
          <span className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-red-500/15">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-2xs font-bold text-red-500">LIVE</span>
          </span>
        </div>

        {/* 좌우 버튼 */}
        {!loading && items.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={() => scroll("left")}
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition hover:border-red-400 ${
                isDark ? "border-white/20 text-white/60 hover:text-white" : "border-slate-300 text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M7 1L3 5l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => scroll("right")}
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition hover:border-red-400 ${
                isDark ? "border-white/20 text-white/60 hover:text-white" : "border-slate-300 text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 스크롤 영역 */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} isDark={isDark} />)}
        </div>
      ) : error || items.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-6 gap-2 ${isDark ? "text-white/40" : "text-slate-400"}`}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="opacity-30">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <p className="text-xs">현재 라이브 방송이 없습니다</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {items.map((item) => (
            <div key={item.videoId} style={{ scrollSnapAlign: "start" }}>
              <LiveCard item={item} all={items} isDark={isDark} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
