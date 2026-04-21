"use client";

import Link from "next/link";

export function LoginRequired() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center px-8 py-12 rounded-2xl border bg-white border-slate-200">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-sm font-medium text-slate-700">로그인이 필요합니다.</p>
        <p className="text-xs mt-1 text-slate-400">이 페이지는 로그인 후 이용할 수 있습니다.</p>
        <Link
          href="/login"
          className="inline-block mt-5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-colors"
        >
          로그인하기
        </Link>
      </div>
    </div>
  );
}
