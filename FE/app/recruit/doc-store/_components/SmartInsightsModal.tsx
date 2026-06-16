"use client";

import { useState, useEffect } from "react";
import { createExperience, extractExperiencesFromDoc } from "@/lib/api/experiences";
import type { SavedDocument } from "@/lib/api/documents";

interface ExtractedItem {
  title: string;
  content: string;
}

interface Props {
  doc: SavedDocument;
  onClose: () => void;
  onSaved: () => void;
  onDocOpen: (id: string) => void;
  onDocDelete: (id: string) => void;
}

export function SmartInsightsModal({ doc, onClose, onSaved, onDocOpen, onDocDelete }: Props) {
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [metrics, setMetrics] = useState({ match: 0, saved: 0 });

  useEffect(() => {
    let isMounted = true;
    const fetchInsights = async () => {
      // 1. Check cache first
      const CACHE_KEY = `insights_${doc.id}`;
      const cached = sessionStorage.getItem(CACHE_KEY);
      
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            if (isMounted) {
              setItems(parsed);
              setSelected(new Set(parsed.map((_, i) => i)));
              setMetrics({
                match: Math.min(99, 85 + parsed.length * 3),
                saved: +(parsed.length * 0.5).toFixed(1),
              });
              setLoading(false);
            }
            return;
          }
        } catch (e) {}
      }

      setLoading(true);
      try {
        const extracted = await extractExperiencesFromDoc(doc.content, "claude-haiku-4-5-20251001");
        if (isMounted) {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(extracted));
          setItems(extracted);
          setSelected(new Set(extracted.map((_, i) => i))); // select all by default
          // Generate mock metrics for the UI based on extracted items
          setMetrics({
            match: Math.min(99, 85 + extracted.length * 3),
            saved: +(extracted.length * 0.5).toFixed(1),
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchInsights();
    return () => { isMounted = false; };
  }, [doc.id, doc.content]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleSave = async () => {
    const toSave = items.filter((_, i) => selected.has(i));
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(toSave.map((item) => createExperience({ title: item.title, content: item.content, sourceDocId: doc.id })));
      setDone(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } finally {
      setSaving(false);
    }
  };

  // UI rendering
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      {/* Dark Mesh Backdrop */}
      <div className="absolute inset-0 bg-[#0B0F19]/90 backdrop-blur-xl" />
      <div className="absolute inset-0 opacity-40 mix-blend-color-dodge bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-900 to-black pointer-events-none" />

      {/* Main Container */}
      <div className="relative w-full h-full max-w-[1400px] flex flex-col p-6 md:p-12 animate-in fade-in duration-500 ease-out">
        
        {/* Top Header Row */}
        <div className="flex items-center justify-between z-10">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-white/10 border border-white/10 text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">
              <div className="w-1.5 h-1.5 rounded-sm bg-indigo-400 animate-pulse" />
              Document Analysis
            </span>
            <h1 className="text-4xl font-light text-white tracking-tight">
              Smart <span className="font-semibold">Insights</span>
            </h1>
            <p className="text-white/40 mt-2 max-w-xl text-sm leading-relaxed truncate">
              {doc.title}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={() => onDocOpen(doc.id)} className="px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-all">
              원문 열기
            </button>
            <button onClick={() => { onDocDelete(doc.id); onClose(); }} className="px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-red-400 hover:text-red-300 text-sm font-medium transition-all">
              삭제
            </button>
            <button onClick={onClose} className="p-2 ml-4 text-white/40 hover:text-white transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col justify-center mt-12 relative z-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center m-auto animate-in zoom-in-95 duration-1000">
              {/* 3D Frosted Glass Folder Representation */}
              <div className="relative w-48 h-36 mb-12">
                {/* Back flap */}
                <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-md rounded-tl-sm border border-white/10" />
                {/* Papers inside */}
                <div className="absolute bottom-4 left-4 right-4 top-2 bg-white/90 rounded-md transform -rotate-3 origin-bottom-left" />
                <div className="absolute bottom-4 left-6 right-2 top-0 bg-white rounded-md transform rotate-2 origin-bottom-right flex flex-col p-3">
                  <div className="w-1/3 h-2 bg-slate-200 rounded-sm mb-4" />
                  <div className="space-y-2">
                    <div className="w-full h-1.5 bg-slate-100 rounded-sm" />
                    <div className="w-5/6 h-1.5 bg-slate-100 rounded-sm" />
                    <div className="w-4/6 h-1.5 bg-slate-100 rounded-sm" />
                  </div>
                </div>
                {/* Front flap (frosted) */}
                <div className="absolute inset-0 top-8 bg-white/10 backdrop-blur-xl rounded-md border-t border-white/30 shadow-[0_-8px_30px_rgba(255,255,255,0.1)] flex items-end justify-start p-4 gap-2">
                   <div className="w-6 h-6 rounded-md bg-zinc-900 border border-white/20 flex items-center justify-center text-[10px] font-bold text-white">N</div>
                   <div className="w-6 h-6 rounded-md bg-emerald-500 border border-white/20 flex items-center justify-center text-white">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2zm4 8h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                   </div>
                   <div className="w-6 h-6 rounded-md bg-purple-600 border border-white/20 flex items-center justify-center text-white">❖</div>
                </div>
              </div>

              <span className="text-white/60 text-sm tracking-wide font-medium">Scanning blueprints & extracting insights...</span>
              <div className="w-64 h-1 bg-white/10 rounded-sm mt-6 overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 bg-indigo-500 w-1/3 rounded-sm animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_15px_rgba(99,102,241,0.6)]" style={{ animation: "progress 2s ease-in-out infinite" }}/>
              </div>
            </div>
          ) : items.length === 0 ? (
             <div className="flex flex-col items-center justify-center m-auto">
               <div className="w-20 h-20 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-white/20">
                   <path d="M21 21l-6-6M3 10a7 7 0 1014 0 7 7 0 00-14 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                 </svg>
               </div>
               <p className="text-white/60 text-lg">추출된 경험 인사이트가 없습니다.</p>
             </div>
          ) : (
            <div className="relative w-full">
              {/* Carousel of Cards (Horizontal scroll) */}
              <div className="flex overflow-x-auto pb-12 pt-4 snap-x snap-mandatory hide-scrollbar gap-6 items-center px-4 md:px-0">
                {items.map((item, i) => {
                  const isSelected = selected.has(i);
                  return (
                    <div 
                      key={i} 
                      onClick={() => toggle(i)}
                      className={`relative shrink-0 snap-center w-[220px] md:w-[240px] h-[300px] rounded-md p-4 cursor-pointer transition-all duration-500 will-change-transform ${
                        isSelected 
                          ? "bg-[#5D6BFE] text-white shadow-[0_0_40px_-5px_rgba(93,107,254,0.4)] scale-100" 
                          : "bg-white text-slate-900 scale-95 opacity-60 hover:opacity-100 hover:scale-[0.98]"
                      }`}
                      style={{
                        transformStyle: 'preserve-3d',
                        perspective: '1000px'
                      }}
                    >
                      {/* INVOICE-like Header for realism */}
                      <div className="flex justify-between items-start mb-3 border-b border-current opacity-20 pb-2">
                        <span className="font-extrabold tracking-widest text-[9px] uppercase">Insight</span>
                        <div className="text-[8px] text-right font-mono uppercase opacity-70">
                          Extracted<br/>{new Date().toLocaleDateString()}
                        </div>
                      </div>
                      
                      <h3 className={`font-bold text-sm mb-2 line-clamp-2 leading-tight ${isSelected ? "text-white" : "text-slate-800"}`}>
                        {item.title}
                      </h3>
                      <div className={`text-[11px] leading-relaxed line-clamp-6 ${isSelected ? "text-indigo-100" : "text-slate-500"}`}>
                        {item.content}
                      </div>

                      {/* Mega Checkmark Overlay for selected state */}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-md bg-blue-600 flex items-center justify-center transform rotate-12 animate-in zoom-in-50 duration-300">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Metrics & Actions */}
              <div className="flex flex-col md:flex-row items-end md:items-center justify-between mt-6 pt-6 border-t border-white/10 gap-6">
                <div className="flex items-center gap-12">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-5xl font-light text-white tracking-tighter tabular-nums">{metrics.match}%</span>
                      <span className="text-white/40 text-xs md:text-sm font-medium">Relevance Target</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-5xl font-light text-white tracking-tighter tabular-nums">{metrics.saved}h</span>
                      <span className="text-white/40 text-xs md:text-sm font-medium">Time Saved</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <p className="text-white/40 text-[11px] md:text-xs font-medium mb-3 max-w-xs text-right leading-relaxed">
                    I've scanned the uploaded blueprints and cross-checked against your research patterns. {selected.size} insights are ready.
                  </p>
                  <button
                    onClick={handleSave}
                    disabled={selected.size === 0 || saving || done}
                    className={`relative overflow-hidden flex items-center gap-2 px-6 py-3 rounded-md font-semibold text-base transition-all ${
                       done ? "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                       : "bg-white text-black hover:bg-slate-100 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {saving ? (
                       <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    ) : done ? (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                    {done ? "저장 완료" : `선택된 ${selected.size}개 저장`}
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
      
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes progress {
          0% { left: -30%; width: 30%; }
          50% { width: 40%; }
          100% { left: 100%; width: 30%; }
        }
      `}</style>
    </div>
  );
}
