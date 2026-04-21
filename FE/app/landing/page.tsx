"use client";

import Link from "next/link";
import { useTheme } from "@/contexts/ThemeContext";

const FEATURES = [
  { icon: "🔍", title: "AI 기반 리서치", desc: "주제를 입력하면 AI가 웹을 탐색해 핵심 정보를 자동으로 수집·정리합니다." },
  { icon: "📄", title: "문서 분석", desc: "PDF, DOCX 파일을 업로드하면 AI가 내용을 요약하고 질문에 답변합니다." },
  { icon: "💬", title: "RAG 채팅", desc: "리서치 결과와 문서를 벡터 DB에 저장해 정확한 컨텍스트 기반으로 대화합니다." },
  { icon: "✍️", title: "문서 작성", desc: "AI 어시스턴트와 함께 마크다운 문서를 작성하고 인사이트를 기록합니다." },
  { icon: "📧", title: "Gmail 연동", desc: "Gmail을 연결해 이메일을 분석하고 리서치 흐름과 통합합니다." },
  { icon: "🎨", title: "커스텀 UI", desc: "다크 모드, 글래스 UI, 배경화면까지 취향에 맞게 인터페이스를 설정합니다." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "주제 입력", desc: "리서치할 주제나 질문을 자유롭게 입력합니다." },
  { step: "02", title: "자동 수집", desc: "AI가 다수의 검색 엔진을 병렬로 탐색해 관련 자료를 수집합니다." },
  { step: "03", title: "분석 & 정리", desc: "수집된 정보를 태스크 단위로 분해하고 심층 분석을 수행합니다." },
  { step: "04", title: "결과 활용", desc: "채팅, 문서 작성, 내보내기로 리서치 결과를 바로 활용합니다." },
];

export default function LandingPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const bg = isDark
    ? "bg-linear-to-br from-slate-950 via-indigo-950 to-slate-900 text-white"
    : "bg-linear-to-br from-slate-50 via-indigo-50 to-slate-100 text-slate-900";

  const subText = isDark ? "text-slate-400" : "text-slate-500";
  const cardCls = isDark
    ? "bg-white/5 border-white/10 hover:bg-white/8 hover:border-indigo-500/30"
    : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md";
  const navLoginCls = isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900";
  const heroLoginCls = isDark
    ? "bg-white/5 hover:bg-white/10 border border-white/10"
    : "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700";
  const footerBorder = isDark ? "border-white/5" : "border-slate-200";
  const footerText = isDark ? "text-slate-500" : "text-slate-400";
  const footerCopy = isDark ? "text-slate-600" : "text-slate-400";
  const ctaCls = isDark
    ? "bg-linear-to-br from-indigo-600/20 to-cyan-600/10 border-indigo-500/20"
    : "bg-linear-to-br from-indigo-50 to-cyan-50 border-indigo-200";

  return (
    <div className={`min-h-screen transition-colors ${bg}`}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-base shadow-lg shadow-indigo-500/30">
            ◈
          </div>
          <span className={`font-bold tracking-tight ${isDark ? "text-white" : "text-slate-800"}`}>ResearchAI</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className={`px-4 py-2 text-sm transition-colors ${navLoginCls}`}>
            로그인
          </Link>
          <Link
            href="/main"
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            시작하기
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-8 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          AI 기반 자동 리서치 플랫폼
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight leading-tight mb-5">
          복잡한 리서치를<br />
          <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-500 to-cyan-500">
            AI가 대신합니다
          </span>
        </h1>
        <p className={`text-lg max-w-xl mx-auto mb-10 leading-relaxed ${subText}`}>
          주제 하나만 입력하세요. ResearchAI가 웹을 탐색하고, 정보를 분석하고,
          바로 활용할 수 있는 결과물을 만들어 드립니다.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/main"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-semibold transition-colors shadow-xl shadow-indigo-500/25"
          >
            무료로 시작하기 →
          </Link>
          <Link href="/login" className={`px-6 py-3 rounded-2xl text-sm font-medium transition-colors ${heroLoginCls}`}>
            로그인
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold mb-2">모든 리서치 워크플로우를 하나에</h2>
          <p className={`text-sm ${subText}`}>수집부터 분석, 저장, 공유까지 끊김 없이 이어집니다.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className={`border rounded-2xl p-6 transition-all ${cardCls}`}>
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
              <p className={`text-xs leading-relaxed ${subText}`}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold mb-2">어떻게 작동하나요?</h2>
          <p className={`text-sm ${subText}`}>4단계로 전문가 수준의 리서치가 완성됩니다.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.step} className="relative text-center">
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="hidden md:block absolute top-5 left-1/2 w-full h-px bg-linear-to-r from-indigo-500/50 to-transparent" />
              )}
              <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-bold mb-4">
                {s.step}
              </div>
              <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
              <p className={`text-xs leading-relaxed ${subText}`}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className={`border rounded-3xl px-10 py-14 text-center ${ctaCls}`}>
          <h2 className="text-3xl font-bold mb-3">지금 바로 시작해보세요</h2>
          <p className={`text-sm mb-8 ${subText}`}>로그인 없이도 AI 리서치를 무료로 체험할 수 있습니다.</p>
          <Link
            href="/main"
            className="inline-block px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-semibold transition-colors shadow-xl shadow-indigo-500/25"
          >
            무료 체험 시작 →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t mt-8 ${footerBorder}`}>
        <div className="max-w-6xl mx-auto px-8 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/70 flex items-center justify-center text-xs text-white">◈</div>
            <span className={`text-xs ${footerText}`}>ResearchAI</span>
          </div>
          <p className={`text-xs ${footerCopy}`}>© 2026 ResearchAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
