"use client";

import { useEffect, useRef, useState } from "react";
import { useBackground, DEFAULT_BG, BgSection } from "@/contexts/BackgroundContext";
import { listBgImages, uploadBgImage, deleteBgImage, bgImageCss, BgImage } from "@/lib/api/backgrounds";
import { useTheme, Theme, UiStyle } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

// ─── Presets ──────────────────────────────────────────────────────────────────

type Preset = { id: string; label: string; value: string };

const SOLID_PRESETS: Preset[] = [
  { id: "default",    label: "기본",     value: "#F5F7FA" },
  { id: "white",      label: "화이트",   value: "#FFFFFF" },
  { id: "blue-tint",  label: "블루",     value: "#EFF6FF" },
  { id: "green-tint", label: "그린",     value: "#F0FDF4" },
  { id: "warm",       label: "웜",       value: "#FFF7ED" },
  { id: "rose",       label: "로즈",     value: "#FFF1F2" },
  { id: "slate",      label: "슬레이트", value: "#0F172A" },
  { id: "navy",       label: "네이비",   value: "#1A1A2E" },
];

const GRADIENT_PRESETS: Preset[] = [
  { id: "brand",    label: "브랜드",    value: "linear-gradient(135deg, #0055A5 0%, #00A0DF 100%)" },
  { id: "purple",   label: "퍼플",      value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { id: "pink",     label: "핑크",      value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  { id: "cyan",     label: "시안",      value: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
  { id: "green",    label: "그린",      value: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" },
  { id: "sunset",   label: "선셋",      value: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
  { id: "midnight", label: "미드나잇",  value: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)" },
  { id: "aurora",   label: "오로라",    value: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
  { id: "forest",   label: "포레스트",  value: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)" },
  { id: "twilight", label: "트와일라잇", value: "linear-gradient(135deg, #30cfd0 0%, #330867 100%)" },
];

// ─── Components ───────────────────────────────────────────────────────────────

function Swatch({ bg, selected, onClick }: { bg: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-video rounded-xl overflow-hidden border-2 transition-all ${
        selected ? "border-indigo-500 shadow-md shadow-indigo-200" : "border-transparent hover:border-slate-300"
      }`}
      style={{ background: bg }}
    >
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shadow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5L4.5 7.5L8 3" stroke="#0055A5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}

function Preview({ bg }: { bg: string }) {
  return (
    <div className="w-full h-32 rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative" style={{ background: bg }}>
      <div className="absolute inset-0 flex items-center justify-center gap-3 p-4">
        <div className="w-8 h-full bg-white/30 backdrop-blur-sm rounded-lg" />
        <div className="flex-1 h-full flex flex-col gap-2">
          <div className="h-5 bg-white/40 backdrop-blur-sm rounded-lg" />
          <div className="h-5 bg-white/30 backdrop-blur-sm rounded-lg w-3/4" />
          <div className="h-5 bg-white/20 backdrop-blur-sm rounded-lg w-1/2" />
        </div>
      </div>
    </div>
  );
}

// ─── Section Editor ───────────────────────────────────────────────────────────

function SectionEditor({ section, images, onUpload, onDelete, isLoggedIn }: {
  section: BgSection;
  images: BgImage[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoggedIn: boolean;
}) {
  const { backgrounds, setBackground } = useBackground();
  const bg = backgrounds[section];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Preview bg={bg} />

      {/* Solid */}
      <div className="space-y-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">단색</span>
        <div className="grid grid-cols-4 gap-3">
          {SOLID_PRESETS.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <Swatch bg={p.value} selected={bg === p.value} onClick={() => setBackground(section, p.value)} />
              <p className="text-2xs text-slate-400 text-center">{p.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gradient */}
      <div className="space-y-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">그라디언트</span>
        <div className="grid grid-cols-5 gap-3">
          {GRADIENT_PRESETS.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <Swatch bg={p.value} selected={bg === p.value} onClick={() => setBackground(section, p.value)} />
              <p className="text-2xs text-slate-400 text-center truncate">{p.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* User Photos */}
      <div className="space-y-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">사용자 사진</span>
        {!isLoggedIn ? (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
            로그인 후 사진을 업로드할 수 있습니다.
          </p>
        ) : (
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-center justify-center disabled:opacity-50"
            >
              {uploading
                ? <span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-slate-400">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
              }
            </button>
            <p className="text-2xs text-slate-400 text-center">사진 추가</p>
          </div>

          {images.map((img) => {
            const css = bgImageCss(img);
            return (
              <div key={img.id} className="space-y-1.5 group">
                <div className="relative">
                  <Swatch bg={css} selected={bg === css} onClick={() => setBackground(section, css)} />
                  <button
                    onClick={() => onDelete(img.id)}
                    className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/50 text-white hidden group-hover:flex items-center justify-center"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p className="text-2xs text-slate-400 text-center truncate">{img.filename}</p>
              </div>
            );
          })}
        </div>
        )}
        {isLoggedIn && <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />}
      </div>

      {bg !== DEFAULT_BG && (
        <button onClick={() => setBackground(section, DEFAULT_BG)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          기본값으로 재설정
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const SECTIONS: { key: BgSection; label: string }[] = [
  { key: "main",     label: "메인" },
  { key: "sessions", label: "리서치" },
];

const THEMES: { key: Theme; label: string; icon: string }[] = [
  { key: "light", label: "라이트", icon: "☀️" },
  { key: "dark",  label: "다크",   icon: "🌙" },
];

export default function BackgroundPage() {
  const { setBackground } = useBackground();
  const { theme, setTheme, uiStyle, setUiStyle } = useTheme();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [activeSection, setActiveSection] = useState<BgSection>("main");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bg-active-section") as BgSection;
      if (saved) setActiveSection(saved);
    } catch {}
  }, []);

  const handleSectionChange = (section: BgSection) => {
    setActiveSection(section);
    try { localStorage.setItem("bg-active-section", section); } catch {}
  };
  const [images, setImages] = useState<BgImage[]>([]);

  useEffect(() => {
    if (!isLoggedIn) { setImages([]); return; }
    listBgImages().then(setImages).catch(() => {});
  }, [isLoggedIn]);

  const handleUpload = async (file: File) => {
    const img = await uploadBgImage(file);
    setImages((prev) => [...prev, img]);
    setBackground(activeSection, bgImageCss(img));
  };

  const handleDelete = async (id: string) => {
    await deleteBgImage(id);
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">배경화면</h1>
        <p className="text-xs text-slate-400 mt-0.5">화면별로 배경을 다르게 설정합니다.</p>
      </div>

      {/* 화면 모드 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-6">
        <div className="space-y-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">화면 모드</span>
          <div className="flex gap-2">
            {THEMES.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  theme === key
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">UI 스타일</span>
          <div className="flex gap-2">
            <button
              onClick={() => setUiStyle("classic")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                uiStyle === "classic"
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-inner"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              ▣ 기본(Classic)
            </button>
            <button
              onClick={() => setUiStyle("glass")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                uiStyle === "glass"
                  ? "bg-indigo-500 text-white border-indigo-600 shadow-md shadow-indigo-200"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              ▤ 글래스(Glass)
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {SECTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSectionChange(key)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeSection === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <SectionEditor
        key={activeSection}
        section={activeSection}
        images={images}
        onUpload={handleUpload}
        onDelete={handleDelete}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}
