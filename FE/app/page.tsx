"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [demoStarted, setDemoStarted] = useState(false);
  const [chatLog, setChatLog] = useState<{ role: "user" | "ai"; content: string; isTyping?: boolean }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 스크롤 인터랙션
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navClasses = scrollY > 50 
    ? "fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm py-4"
    : "fixed top-0 left-0 right-0 z-50 bg-transparent py-6 border-b border-transparent";

  const heroOpacity = Math.max(0, 1 - scrollY / 400);
  const heroTranslateY = scrollY * 0.4;
  const bgTranslateY = scrollY * 0.15;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (!demoStarted) {
      setDemoStarted(true);
    }

    // 사용자 메시지 추가
    const userMsg = query.trim();
    setChatLog((prev) => [...prev, { role: "user", content: userMsg }]);
    setQuery("");

    // AI 응답 시뮬레이션
    setTimeout(() => {
      setChatLog((prev) => [...prev, { role: "ai", content: "", isTyping: true }]);
      
      setTimeout(() => {
        setChatLog((prev) => {
          const newLog = [...prev];
          newLog[newLog.length - 1] = { 
            role: "ai", 
            content: "현재 게스트 데모 모드로 접속 중입니다. 웹 브라우징 및 전체 RAG 데이터 검색 기능을 사용하시려면 로그인이 필요합니다.\n\n요청하신 주제에 관해 간략히 브리핑해 드리겠습니다. (AI 시뮬레이션 응답 중...)" 
          };
          return newLog;
        });
      }, 1500);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-indigo-500/30 font-sans relative overflow-x-hidden">
      {/* Background Glow Effects (Light Mode) */}
      <div 
        className="pointer-events-none fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 blur-[120px]" 
        style={{ transform: `translateY(${bgTranslateY}px)` }}
      />
      <div 
        className="pointer-events-none fixed top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-200/30 blur-[100px]" 
        style={{ transform: `translateY(${bgTranslateY * 0.8}px)` }}
      />

      {/* Navigation */}
      <nav className={`${navClasses} transition-all duration-300`}>
        <div className="w-full max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-md bg-indigo-600 text-white font-black text-lg tracking-tighter shadow-md shadow-indigo-200">
              R
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800">
              ResearchAI
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link href="/login" className="text-slate-600 hover:text-indigo-600 transition-colors">
              로그인
            </Link>
            <Link 
              href="/main" 
              className="px-5 py-2.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-transform active:scale-95 shadow-md shadow-slate-300"
            >
              대시보드 접속
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main 
        className="relative z-10 flex flex-col items-center pt-32 px-6 w-full max-w-4xl mx-auto min-h-[85vh]"
      >
        <div 
          className="transition-all duration-700 w-full flex flex-col items-center"
          style={{ 
            opacity: demoStarted ? 0 : heroOpacity, 
            transform: demoStarted ? 'translateY(-20px) scale(0.95)' : `translateY(${heroTranslateY}px)`,
            height: demoStarted ? 0 : 'auto',
            overflow: demoStarted ? 'hidden' : 'visible',
            marginBottom: demoStarted ? 0 : '2rem'
          }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Powered by Advanced Generative AI
          </div>

          <h1 className="text-5xl md:text-[5.5rem] font-extrabold tracking-tight text-slate-900 mb-8 leading-[1.1] text-center">
            Unleash the Power of<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">
              Automated Research
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-14 font-light leading-relaxed text-center">
            웹 브라우징, 문서 분석, 기업 프로파일링까지.<br />
            ResearchAI가 당신의 리서치를 단 몇 초 만에 완성합니다.
          </p>
        </div>

        {/* Interactive Experience Bar / Demo Interface */}
        <div className={`w-full max-w-2xl mx-auto transition-all duration-700 ${demoStarted ? 'pt-8' : 'pt-0'}`}>
          {/* Chat Interface (Shows up after first prompt) */}
          {demoStarted && (
            <div className="w-full bg-white border border-slate-200 rounded-3xl shadow-xl mb-6 overflow-hidden flex flex-col h-[60vh] max-h-[600px]">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-semibold text-slate-700">체험 모드 AI 접속 중</span>
                <Link href="/login" className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
                  전체 기능 잠금 해제 (로그인)
                </Link>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
                {chatLog.map((chat, idx) => (
                  <div key={idx} className={`flex ${chat.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                      chat.role === "user" 
                        ? "bg-slate-900 text-white rounded-br-sm" 
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                    }`}>
                      {chat.isTyping ? (
                        <div className="flex gap-1 items-center h-4">
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{chat.content}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Box */}
          <form 
            onSubmit={handleSearch} 
            className="w-full relative group z-10"
          >
            <div className={`absolute inset-0 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur-lg transition-opacity duration-500 ${demoStarted ? 'opacity-10' : 'opacity-15 group-hover:opacity-25'}`} />
            <div className={`relative flex items-center bg-white border border-slate-300 hover:border-slate-400 rounded-2xl overflow-hidden shadow-xl transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 ${demoStarted ? 'shadow-md' : 'shadow-2xl hover:-translate-y-0.5'}`}>
              <span className="pl-6 text-slate-400 text-xl font-mono">/</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={demoStarted ? "추가로 궁금한 점을 입력하세요..." : "분석할 주제나 기업명을 입력해보세요..."}
                className="w-full bg-transparent text-slate-900 placeholder-slate-400 text-lg px-4 py-5 focus:outline-none focus:ring-0 peer"
                autoComplete="off"
              />
              <button
                type="submit"
                className="mr-3 shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white transition-colors peer-focus:bg-slate-900 peer-focus:text-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </form>

          {/* Suggestion Chips */}
          {!demoStarted && (
            <div className="mt-8 text-sm text-slate-500 flex items-center justify-center gap-4">
              <span className="hover:text-indigo-600 cursor-pointer transition-colors px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200" onClick={() => setQuery("2024년 모바일 AI 시장 동향")}>💡 "모바일 AI 시장 동향"</span>
              <span className="hover:text-indigo-600 cursor-pointer transition-colors px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200" onClick={() => setQuery("테슬라 최신 어닝 콜 요약")}>💡 "테슬라 어닝 콜 요약"</span>
            </div>
          )}
        </div>
      </main>

      {/* Feature Grid */}
      <section className="relative z-10 w-full min-h-[50vh] bg-slate-50 border-t border-slate-200 pb-32">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 pt-20">
          <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3 tracking-tight">심층 자율 탐색</h3>
            <p className="text-slate-500 leading-relaxed text-sm font-light">
              웹 문서를 다중 Agent가 동시다발적으로 분석하여 가장 신뢰성 있는 레포트를 작성합니다.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:cyan-200 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3 tracking-tight">인스턴트 문서 파싱</h3>
            <p className="text-slate-500 leading-relaxed text-sm font-light">
              복잡한 논문이나 사내 비공개 기술 문서를 업로드해 AI의 이해도를 순식간에 확장하세요.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3 tracking-tight">RAG 지식 기반 연동</h3>
            <p className="text-slate-500 leading-relaxed text-sm font-light">
              개인적인 자료와 실시간 웹 데이터를 함께 결합한 RAG 기술로 환각 없는 정확한 지식을 도출합니다.
            </p>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-200 py-10 bg-slate-50 text-center flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 flex items-center justify-center rounded bg-slate-200 text-slate-500 font-bold text-sm">R</div>
        <p className="text-xs text-slate-400 font-light">&copy; 2026 ResearchAI. Crafted with Modern Light UI.</p>
      </footer>
    </div>
  );
}
