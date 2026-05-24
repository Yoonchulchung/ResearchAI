"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listTechBlogPosts, type TechBlogPost } from "@/lib/api/tech-blogs";

function IconFeed() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 18 18" fill="none">
      <circle cx="4.5" cy="13.5" r="1.4" fill="currentColor" />
      <path d="M3.5 8.5C6.8 8.5 9.5 11.2 9.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 4C9.3 4 14 8.7 14 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function TechBlogCard() {
  const [posts, setPosts] = useState<TechBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    listTechBlogPosts({ limit: 50 })
      .then((result) => {
        if (!cancelled) setPosts(result.posts);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-indigo-600">
          <IconFeed />
          <h2 className="text-m font-bold text-slate-700">기술 블로그</h2>
        </div>
        <Link href="/news/tech-blogs" className="text-2xs font-semibold text-slate-400 hover:text-indigo-500 transition-colors">
          전체 보기
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
              <div className="h-2.5 bg-slate-100 rounded animate-pulse w-1/3" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <p className="text-xs text-slate-400">기술 블로그를 불러오지 못했습니다</p>
          <Link href="/news/tech-blogs" className="text-xs font-semibold text-indigo-500 hover:text-indigo-600">
            페이지에서 다시 시도
          </Link>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">표시할 글이 없습니다</p>
      ) : (
        <ul className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
          {posts.map((post) => (
            <li key={post.id}>
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg px-1 py-2 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-center gap-2 text-2xs text-slate-400">
                  <span className="truncate font-semibold text-indigo-500">{post.sourceName}</span>
                  {post.publishedAt && <span className="shrink-0">{formatDate(post.publishedAt)}</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-700">
                  {post.title}
                </p>
                {post.summary && (
                  <p className="mt-0.5 line-clamp-1 text-2xs leading-relaxed text-slate-400">
                    {post.summary}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
