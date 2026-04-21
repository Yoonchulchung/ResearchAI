"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Marker,
  Sphere,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { useTheme } from "@/contexts/ThemeContext";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface ConflictZone {
  code: string;
  score: number;
  headlines: string[];
}

const COUNTRY_INFO: Record<string, { name: string; query: string; warNote?: string }> = {
  "804": { name: "우크라이나", query: "Ukraine war 2025", warNote: "러시아-우크라이나 전쟁" },
  "643": { name: "러시아", query: "Russia Ukraine war", warNote: "우크라이나 침공" },
  "376": { name: "이스라엘", query: "Israel Gaza war 2025", warNote: "가자 전쟁" },
  "275": { name: "팔레스타인", query: "Gaza Palestine war", warNote: "가자 전쟁" },
  "729": { name: "수단", query: "Sudan civil war 2025", warNote: "수단 내전" },
  "104": { name: "미얀마", query: "Myanmar civil war 2025", warNote: "군부 쿠데타 내전" },
  "231": { name: "에티오피아", query: "Ethiopia conflict 2025", warNote: "국내 무장 분쟁" },
  "706": { name: "소말리아", query: "Somalia conflict Al-Shabaab", warNote: "알샤바브 분쟁" },
  "887": { name: "예멘", query: "Yemen war Houthi 2025", warNote: "예멘 내전·후티 분쟁" },
  "760": { name: "시리아", query: "Syria conflict 2025", warNote: "시리아 분쟁" },
  "332": { name: "아이티", query: "Haiti gang violence 2025", warNote: "갱단 무력 충돌" },
  "180": { name: "콩고민주공화국", query: "DR Congo M23 conflict 2025", warNote: "M23 반군 분쟁" },
  "466": { name: "말리", query: "Mali Sahel conflict 2025", warNote: "사헬 무장 분쟁" },
  "562": { name: "니제르", query: "Niger conflict 2025", warNote: "사헬 무장 분쟁" },
  "854": { name: "부르키나파소", query: "Burkina Faso conflict 2025", warNote: "사헬 무장 분쟁" },
  "434": { name: "리비아", query: "Libya conflict 2025", warNote: "리비아 내전" },
  "422": { name: "레바논", query: "Lebanon conflict Hezbollah 2025", warNote: "헤즈볼라 분쟁" },
  "156": { name: "중국", query: "China news 2025" },
  "840": { name: "미국", query: "United States news 2025" },
  "276": { name: "독일", query: "Germany news 2025" },
  "250": { name: "프랑스", query: "France news 2025" },
  "826": { name: "영국", query: "United Kingdom news 2025" },
  "392": { name: "일본", query: "Japan news 2025" },
  "410": { name: "대한민국", query: "South Korea news 2025" },
  "356": { name: "인도", query: "India news 2025" },
  "076": { name: "브라질", query: "Brazil news 2025" },
  "036": { name: "호주", query: "Australia news 2025" },
  "124": { name: "캐나다", query: "Canada news 2025" },
  "484": { name: "멕시코", query: "Mexico news 2025" },
  "682": { name: "사우디아라비아", query: "Saudi Arabia news 2025" },
  "792": { name: "터키", query: "Turkey news 2025" },
  "566": { name: "나이지리아", query: "Nigeria news 2025" },
  "710": { name: "남아프리카공화국", query: "South Africa news 2025" },
  "360": { name: "인도네시아", query: "Indonesia news 2025" },
  "586": { name: "파키스탄", query: "Pakistan news 2025" },
  "050": { name: "방글라데시", query: "Bangladesh news 2025" },
  "704": { name: "베트남", query: "Vietnam news 2025" },
  "764": { name: "태국", query: "Thailand news 2025" },
  "616": { name: "폴란드", query: "Poland news 2025" },
  "528": { name: "네덜란드", query: "Netherlands news 2025" },
  "752": { name: "스웨덴", query: "Sweden news 2025" },
  "578": { name: "노르웨이", query: "Norway news 2025" },
  "724": { name: "스페인", query: "Spain news 2025" },
  "380": { name: "이탈리아", query: "Italy news 2025" },
  "040": { name: "오스트리아", query: "Austria news 2025" },
  "756": { name: "스위스", query: "Switzerland news 2025" },
  "608": { name: "필리핀", query: "Philippines news 2025" },
  "818": { name: "이집트", query: "Egypt news 2025" },
  "288": { name: "가나", query: "Ghana news 2025" },
  "404": { name: "케냐", query: "Kenya news 2025" },
  "032": { name: "아르헨티나", query: "Argentina news 2025" },
  "152": { name: "칠레", query: "Chile news 2025" },
  "170": { name: "콜롬비아", query: "Colombia news 2025" },
  "858": { name: "우루과이", query: "Uruguay news 2025" },
  "458": { name: "말레이시아", query: "Malaysia news 2025" },
  "702": { name: "싱가포르", query: "Singapore news 2025" },
  "364": { name: "이란", query: "Iran news 2025" },
  "368": { name: "이라크", query: "Iraq news 2025" },
};

interface CountryNewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

interface SelectedCountry {
  id: string;
  name: string;
  query: string;
  warNote?: string;
}

// 결정론적 별 위치 (SSR 안전)
const STARS: { cx: number; cy: number; r: number; o: number }[] = Array.from({ length: 80 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  const r2 = (i * 48271 + 11) % 233280;
  return {
    cx: (seed / 233280) * 100,
    cy: (r2 / 233280) * 100,
    r: 0.3 + ((i * 7) % 10) / 15,
    o: 0.2 + ((i * 13) % 10) / 12,
  };
});

// ─── Color Palettes (Dark / Light) ────────────────────────────────────────────
const PALETTE = {
  dark: {
    // Container
    cardBg: "bg-[#050b1a]",
    cardBorder: "border-white/5",
    cardShadow: "shadow-cyan-950/40",
    // Background gradient
    bgGradient: "bg-linear-to-br from-[#050b1a] via-[#0a1026] to-[#020617]",
    globeBg: "bg-[#020617]",
    // Nebula
    nebula: `
      radial-gradient(circle at 15% 20%, rgba(14, 165, 233, 0.15) 0%, transparent 45%),
      radial-gradient(circle at 85% 80%, rgba(236, 72, 153, 0.08) 0%, transparent 45%),
      radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.06) 0%, transparent 70%)`,
    atmosphere: "radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.18) 0%, rgba(34, 211, 238, 0.05) 35%, transparent 55%)",
    // Text
    title: "text-white",
    subText: "text-cyan-300/90",
    mutedText: "text-white/40",
    hudText: "text-cyan-300/60",
    accentText: "text-cyan-300",
    // Border & chrome
    divider: "bg-white/10",
    accentBorder: "border-cyan-500/20",
    accentBorderHover: "border-cyan-400/40",
    hudCorner: "border-cyan-400/50",
    // Globe
    globeGrad: { inner: "#1e3a5f", mid: "#0a1a33", outer: "#050b1a" },
    halo: "#22d3ee",
    graticule: "rgba(56, 189, 248, 0.06)",
    sphereStroke: "rgba(34, 211, 238, 0.25)",
    // Country fills
    countryDefault: "#0b1e3f",
    countryInfo: "#1e3a5f",
    countryHover: "#0891b2",
    countrySelected: "#06b6d4",
    countryStroke: "rgba(56, 189, 248, 0.12)",
    countrySelectedStroke: "rgba(34, 211, 238, 0.8)",
    countryHoverStroke: "rgba(103, 232, 249, 0.5)",
    // Conflict
    conflictBase: "#7f1d1d",
    conflictHover: "#fb7185",
    conflictSelected: "#f43f5e",
    conflictStroke: "rgba(244, 63, 94, 0.45)",
    // Marker
    markerDot: "#22d3ee",
    markerDotDim: "rgba(103, 232, 249, 0.55)",
    // Tooltip
    tooltipBg: "bg-slate-900/95",
    tooltipBorder: "border-cyan-400/30",
    tooltipTitle: "text-cyan-100",
    tooltipBody: "text-white/70",
    // News panel
    newsPanelBg: "bg-linear-to-br from-slate-900/60 to-slate-950/60",
    newsPanelBorder: "border-cyan-500/15",
    newsHeaderBg: "bg-linear-to-r from-cyan-500/10 via-cyan-500/5 to-transparent",
    newsCardBg: "bg-slate-800/30 hover:bg-slate-800/60",
    newsCardBorder: "border-white/8 hover:border-cyan-400/40",
    newsTitle: "text-white/90 group-hover:text-white",
    newsSource: "text-cyan-300/80",
    newsMeta: "text-white/40",
    newsDot: "bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.8)]",
    accentBar: "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]",
    ctaBtn: "bg-linear-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 shadow-cyan-500/30 hover:shadow-cyan-500/50",
  },
  light: {
    cardBg: "bg-white",
    cardBorder: "border-slate-200",
    cardShadow: "shadow-indigo-200/40",
    bgGradient: "bg-linear-to-br from-slate-50 via-sky-50/40 to-slate-100",
    globeBg: "bg-linear-to-br from-sky-50 to-indigo-50/50",
    nebula: `
      radial-gradient(circle at 15% 20%, rgba(14, 165, 233, 0.08) 0%, transparent 45%),
      radial-gradient(circle at 85% 80%, rgba(99, 102, 241, 0.06) 0%, transparent 45%)`,
    atmosphere: "radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.12) 0%, rgba(14, 165, 233, 0.04) 35%, transparent 55%)",
    title: "text-slate-800",
    subText: "text-sky-700",
    mutedText: "text-slate-400",
    hudText: "text-sky-600/70",
    accentText: "text-sky-600",
    divider: "bg-slate-200",
    accentBorder: "border-sky-300/50",
    accentBorderHover: "border-sky-400/70",
    hudCorner: "border-sky-500/60",
    globeGrad: { inner: "#dbeafe", mid: "#eff6ff", outer: "#f8fafc" },
    halo: "#0ea5e9",
    graticule: "rgba(14, 165, 233, 0.12)",
    sphereStroke: "rgba(14, 165, 233, 0.35)",
    countryDefault: "#f1f5f9",
    countryInfo: "#cbd5e1",
    countryHover: "#38bdf8",
    countrySelected: "#0ea5e9",
    countryStroke: "rgba(148, 163, 184, 0.35)",
    countrySelectedStroke: "rgba(2, 132, 199, 0.8)",
    countryHoverStroke: "rgba(14, 165, 233, 0.6)",
    conflictBase: "#fecaca",
    conflictHover: "#fb7185",
    conflictSelected: "#e11d48",
    conflictStroke: "rgba(225, 29, 72, 0.5)",
    markerDot: "#0ea5e9",
    markerDotDim: "rgba(14, 165, 233, 0.55)",
    tooltipBg: "bg-white/95",
    tooltipBorder: "border-sky-300/60",
    tooltipTitle: "text-slate-800",
    tooltipBody: "text-slate-600",
    newsPanelBg: "bg-linear-to-br from-white to-slate-50",
    newsPanelBorder: "border-sky-200",
    newsHeaderBg: "bg-linear-to-r from-sky-100/50 via-sky-50/30 to-transparent",
    newsCardBg: "bg-white hover:bg-sky-50/70",
    newsCardBorder: "border-slate-200 hover:border-sky-300",
    newsTitle: "text-slate-800 group-hover:text-sky-700",
    newsSource: "text-sky-600",
    newsMeta: "text-slate-400",
    newsDot: "bg-sky-500 shadow-[0_0_4px_rgba(14,165,233,0.5)]",
    accentBar: "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.6)]",
    ctaBtn: "bg-linear-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 shadow-sky-500/30 hover:shadow-sky-500/50",
  },
};

export function WorldMapCard() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const C = isDark ? PALETTE.dark : PALETTE.light;

  const [selected, setSelected] = useState<SelectedCountry | null>(null);
  const [news, setNews] = useState<CountryNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; warNote?: string; headlines?: string[] } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const [conflictMap, setConflictMap] = useState<Map<string, ConflictZone>>(new Map());
  const [conflictLoading, setConflictLoading] = useState(true);
  const [geoData, setGeoData] = useState<{ id: string; centroid: [number, number] }[]>([]);
  const [rotation, setRotation] = useState<[number, number, number]>([30, -10, 0]);
  const [scale, setScale] = useState(260);
  const [autoRotate, setAutoRotate] = useState(true);
  const interactingRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; startRot: [number, number, number] } | null>(null);

  // Auto-rotation
  useEffect(() => {
    if (!autoRotate) return;
    let frame: number;
    const tick = () => {
      if (!interactingRef.current) {
        setRotation(([lon, lat, g]) => [(lon + 0.12) % 360, lat, g]);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoRotate]);

  // Scroll-to-zoom (native listener for passive:false)
  useEffect(() => {
    const el = globeContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => {
        const next = s - e.deltaY * 0.8;
        return Math.max(180, Math.min(700, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    fetch("http://localhost:3001/api/news/conflict-zones")
      .then((r) => r.json())
      .then((data: ConflictZone[]) => {
        const map = new Map<string, ConflictZone>();
        for (const zone of data) map.set(zone.code, zone);
        setConflictMap(map);
      })
      .catch(() => {})
      .finally(() => setConflictLoading(false));
  }, []);

  const fetchCountryNews = useCallback((query: string) => {
    setNewsLoading(true);
    setNews([]);
    fetch(`http://localhost:3001/api/news/country?name=${encodeURIComponent(query)}&limit=6`)
      .then((r) => r.json())
      .then((data: CountryNewsItem[]) => setNews(data ?? []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, []);

  useEffect(() => {
    if (selected) {
      fetchCountryNews(selected.query);
      const geo = geoData.find((g) => g.id === selected.id);
      if (geo) {
        setRotation([-geo.centroid[0], -geo.centroid[1], 0]);
      }
    }
  }, [selected, fetchCountryNews, geoData]);

  const handleGeoClick = useCallback((geo: { id: string }) => {
    const id = String(geo.id);
    const info = COUNTRY_INFO[id];
    if (!info) return;
    const conflict = conflictMap.get(id);
    const warNote = conflict ? (info.warNote ?? `분쟁 강도 ${conflict.score}`) : info.warNote;
    setSelected({ id, name: info.name, query: info.query, warNote });
  }, [conflictMap]);

  const handleMouseMove = useCallback((geo: { id: string }, evt: React.MouseEvent) => {
    const id = String(geo.id);
    const info = COUNTRY_INFO[id];
    if (!info) { setTooltip(null); return; }
    const rect = cardRef.current?.getBoundingClientRect();
    const conflict = conflictMap.get(id);
    setTooltip({
      x: rect ? evt.clientX - rect.left : evt.clientX,
      y: rect ? evt.clientY - rect.top : evt.clientY,
      name: info.name,
      warNote: conflict ? (info.warNote ?? `분쟁 강도 ${conflict.score}`) : info.warNote,
      headlines: conflict?.headlines,
    });
  }, [conflictMap]);

  const handleDragStart = (e: React.PointerEvent) => {
    interactingRef.current = true;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRot: [...rotation] };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const [sLon, sLat, sG] = dragRef.current.startRot;
    setRotation([sLon + dx * 0.3, Math.max(-85, Math.min(85, sLat - dy * 0.3)), sG]);
  };
  const handleDragEnd = () => {
    dragRef.current = null;
    setTimeout(() => { interactingRef.current = false; }, 500);
  };

  const getGeoColor = (id: string): string => {
    const conflict = conflictMap.get(id);
    const isHovered = hoveredId === id;
    const isSelected_ = selected?.id === id;
    const hasInfo = !!COUNTRY_INFO[id];
    if (conflict) {
      if (isSelected_) return C.conflictSelected;
      if (isHovered) return C.conflictHover;
      return C.conflictBase;
    }
    if (isSelected_) return C.countrySelected;
    if (isHovered && hasInfo) return C.countryHover;
    if (hasInfo) return C.countryInfo;
    return C.countryDefault;
  };

  const getGeoStroke = (id: string): string => {
    const conflict = conflictMap.get(id);
    if (conflict) return C.conflictStroke;
    if (selected?.id === id) return C.countrySelectedStroke;
    if (hoveredId === id && COUNTRY_INFO[id]) return C.countryHoverStroke;
    return C.countryStroke;
  };

  const conflictMarkers = useMemo(() => {
    return geoData.filter((g) => conflictMap.has(g.id)).map((g) => ({
      id: g.id,
      coords: g.centroid,
      score: conflictMap.get(g.id)!.score,
    }));
  }, [geoData, conflictMap]);

  return (
    <div ref={cardRef} className={`rounded-3xl overflow-hidden relative shadow-2xl ${C.cardShadow} ${C.cardBg} border ${C.cardBorder}`}>
      <div className={`absolute inset-0 ${C.bgGradient} pointer-events-none`} />

      {/* Starfield — 다크 모드에서만 */}
      {isDark && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 100 100">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.cx} cy={s.cy} r={s.r * 0.15} fill="white" opacity={s.o}>
              <animate attributeName="opacity" values={`${s.o};${s.o * 0.3};${s.o}`} dur={`${2 + (i % 5)}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      )}

      {/* Nebula glows */}
      <div
        className={`absolute inset-0 pointer-events-none ${isDark ? "opacity-50" : "opacity-70"}`}
        style={{ backgroundImage: C.nebula }}
      />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="relative w-2 h-2">
                <span className={`absolute inset-0 rounded-full ${isDark ? "bg-cyan-400" : "bg-sky-500"} animate-ping opacity-75`} />
                <span className={`relative rounded-full w-2 h-2 ${isDark ? "bg-cyan-400" : "bg-sky-500"} block`} />
              </div>
              <span className={`text-micro font-mono uppercase tracking-[0.25em] ${C.subText}`}>LIVE · GLOBAL</span>
            </div>
            <div className={`w-px h-4 ${C.divider}`} />
            <h2 className={`text-base font-bold tracking-tight ${C.title}`}>GLOBAL INTELLIGENCE</h2>
            {conflictLoading ? (
              <span className={`text-2xs animate-pulse font-mono ${C.hudText}`}>SCANNING...</span>
            ) : conflictMap.size > 0 ? (
              <span className={`text-2xs font-mono tracking-wider px-2 py-0.5 rounded-full border ${isDark ? "text-rose-300 bg-rose-500/10 border-rose-500/30" : "text-rose-600 bg-rose-50 border-rose-200"}`}>
                ⚠ {conflictMap.size} HOTSPOTS DETECTED
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRotate((v) => !v)}
              className={`text-2xs font-mono tracking-wider px-2.5 py-1 rounded-full transition-colors border ${C.subText} ${C.accentBorder} hover:${C.accentBorderHover}`}
            >
              {autoRotate ? "❚❚ 정지" : "▶ 자동 회전"}
            </button>
            {selected && (
              <button
                onClick={() => { setSelected(null); setNews([]); }}
                className={`text-xs ${C.mutedText} hover:${C.title} transition-colors`}
              >
                ✕ 닫기
              </button>
            )}
          </div>
        </div>

        {/* Globe container */}
        <div
          ref={globeContainerRef}
          className={`relative rounded-2xl overflow-hidden aspect-16/10 ${C.globeBg}`}
          onMouseLeave={() => { setTooltip(null); setHoveredId(null); }}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: C.atmosphere }}
          />

          <ComposableMap
            projection="geoOrthographic"
            projectionConfig={{ scale, rotate: rotation, center: [0, 0] }}
            style={{ width: "100%", height: "100%", display: "block" }}
          >
            <defs>
              <radialGradient id="globe-gradient" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor={C.globeGrad.inner} stopOpacity={0.9} />
                <stop offset="60%" stopColor={C.globeGrad.mid} stopOpacity={0.95} />
                <stop offset="100%" stopColor={C.globeGrad.outer} stopOpacity={1} />
              </radialGradient>
              <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%">
                <stop offset="88%" stopColor={C.halo} stopOpacity={0} />
                <stop offset="95%" stopColor={C.halo} stopOpacity={isDark ? 0.5 : 0.35} />
                <stop offset="100%" stopColor={C.halo} stopOpacity={0} />
              </radialGradient>
              <filter id="pulse-blur" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="1.5" />
              </filter>
            </defs>

            <Sphere id="halo" fill="url(#atmosphere)" stroke="none" strokeWidth={0} />
            <Sphere id="globe" fill="url(#globe-gradient)" stroke={C.sphereStroke} strokeWidth={0.8} />
            <Graticule stroke={C.graticule} strokeWidth={0.4} />

            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ rsmKey: string; id: string; geometry: unknown }> }) => {
                if (geoData.length === 0 && geographies.length > 0) {
                  const centroids = geographies.map((g) => ({
                    id: String(g.id),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    centroid: geoCentroid(g as any) as [number, number],
                  }));
                  setGeoData(centroids);
                }
                return geographies.map((geo) => {
                  const id = String(geo.id);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getGeoColor(id)}
                      stroke={getGeoStroke(id)}
                      strokeWidth={conflictMap.has(id) || selected?.id === id ? 0.7 : 0.3}
                      style={{
                        default: { outline: "none", transition: "fill 0.3s ease, stroke 0.3s ease" },
                        hover: { outline: "none", cursor: COUNTRY_INFO[id] ? "pointer" : "default" },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={(evt: React.MouseEvent) => {
                        setHoveredId(id);
                        handleMouseMove(geo, evt);
                      }}
                      onMouseMove={(evt: React.MouseEvent) => handleMouseMove(geo, evt)}
                      onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
                      onClick={() => handleGeoClick(geo)}
                    />
                  );
                });
              }}
            </Geographies>

            {conflictMarkers.map((m) => {
              const size = Math.min(10, 4 + m.score * 0.6);
              return (
                <Marker key={m.id} coordinates={m.coords}>
                  <circle r={size} fill="none" stroke={C.conflictSelected} strokeWidth={0.8} opacity={0.9}>
                    <animate attributeName="r" values={`${size};${size * 2.5};${size}`} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0;0.9" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  <circle r={size} fill="none" stroke={C.conflictHover} strokeWidth={0.5} opacity={0.7}>
                    <animate attributeName="r" values={`${size};${size * 2};${size}`} dur="2.5s" begin="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.7;0;0.7" dur="2.5s" begin="0.5s" repeatCount="indefinite" />
                  </circle>
                  <circle r={size * 0.6} fill={isDark ? "rgba(244, 63, 94, 0.35)" : "rgba(225, 29, 72, 0.28)"} filter="url(#pulse-blur)" />
                  <circle r={1.5} fill={isDark ? "#fff" : "#fee2e2"} />
                  <circle r={2.5} fill="none" stroke={C.conflictSelected} strokeWidth={0.8} />
                </Marker>
              );
            })}

            {geoData
              .filter((g) => COUNTRY_INFO[g.id] && !conflictMap.has(g.id))
              .map((g) => {
                const isSelected_ = selected?.id === g.id;
                return (
                  <Marker key={g.id} coordinates={g.centroid}>
                    {isSelected_ && (
                      <>
                        <circle r={6} fill="none" stroke={C.markerDot} strokeWidth={0.6} opacity={0.8}>
                          <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle r={4} fill="none" stroke={C.markerDot} strokeWidth={0.4} opacity={0.6} />
                      </>
                    )}
                    <circle r={isSelected_ ? 2 : 1} fill={isSelected_ ? C.markerDot : C.markerDotDim} />
                  </Marker>
                );
              })}
          </ComposableMap>

          {/* HUD corner markers */}
          <div className={`absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 ${C.hudCorner}`} />
          <div className={`absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 ${C.hudCorner}`} />
          <div className={`absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 ${C.hudCorner}`} />
          <div className={`absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 ${C.hudCorner}`} />

          {/* Coordinate readout */}
          <div className={`absolute top-4 right-8 font-mono text-2xs text-right ${C.hudText}`}>
            <div>LON {(-rotation[0]).toFixed(1)}°</div>
            <div>LAT {(-rotation[1]).toFixed(1)}°</div>
            <div className="mt-1 opacity-70">ZOOM {(scale / 260).toFixed(2)}×</div>
          </div>

          {!selected && (
            <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 text-2xs font-mono tracking-widest uppercase ${C.hudText}`}>
              ▸ DRAG · SCROLL TO ZOOM ◂
            </div>
          )}

          {tooltip && (
            <div
              className={`pointer-events-none absolute z-20 backdrop-blur-md text-xs px-3 py-2 rounded-xl shadow-2xl border max-w-64 ${C.tooltipBg} ${C.tooltipBorder}`}
              style={{ left: tooltip.x + 16, top: tooltip.y - 40 }}
            >
              <p className={`font-bold tracking-tight ${C.tooltipTitle}`}>{tooltip.name}</p>
              {tooltip.warNote && (
                <p className={`text-2xs mt-1 flex items-center gap-1 ${isDark ? "text-rose-300" : "text-rose-600"}`}>
                  <span className={`w-1 h-1 rounded-full animate-pulse ${isDark ? "bg-rose-400" : "bg-rose-500"}`} />
                  {tooltip.warNote}
                </p>
              )}
              {tooltip.headlines && tooltip.headlines.length > 0 && (
                <p className={`text-micro mt-1.5 line-clamp-2 leading-snug border-t pt-1.5 ${C.tooltipBody} ${isDark ? "border-white/10" : "border-slate-200"}`}>
                  {tooltip.headlines[0]}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Selected country news panel */}
        {selected && (
          <div className={`mt-5 rounded-2xl border backdrop-blur-sm overflow-hidden ${C.newsPanelBg} ${C.newsPanelBorder}`}>
            <div className={`px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap ${C.newsHeaderBg} ${isDark ? "border-white/5" : "border-slate-200"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-1 h-6 rounded-full ${C.accentBar}`} />
                  <h3 className={`text-lg font-bold tracking-tight ${C.title}`}>{selected.name}</h3>
                  <span className={`text-2xs font-mono uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border ${C.subText} ${isDark ? "bg-cyan-500/10 border-cyan-400/25" : "bg-sky-50 border-sky-200"}`}>
                    ◈ INTEL
                  </span>
                </div>
                {selected.warNote && (
                  <p className={`text-xs mt-1 flex items-center gap-1.5 ml-3 ${isDark ? "text-rose-300/90" : "text-rose-600"}`}>
                    <span className={`w-1 h-1 rounded-full animate-pulse ${isDark ? "bg-rose-400" : "bg-rose-500"}`} />
                    {selected.warNote}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  sessionStorage.setItem("dashboard-topic", selected.name + " 최신 뉴스");
                  router.push("/sessions/new");
                }}
                className={`shrink-0 text-xs font-semibold text-white px-4 py-2 rounded-xl shadow-lg transition-all hover:-translate-y-0.5 ${C.ctaBtn}`}
              >
                ▸ 리서치 시작
              </button>
            </div>

            <div className="p-4">
              {newsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`h-24 rounded-xl animate-pulse ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
                  ))}
                </div>
              ) : news.length === 0 ? (
                <p className={`text-sm text-center py-8 ${C.mutedText}`}>데이터를 수신하지 못했습니다</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {news.map((item, i) => (
                    <a
                      key={i}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group relative flex flex-col gap-2 p-4 rounded-xl border transition-all hover:-translate-y-0.5 overflow-hidden ${C.newsCardBg} ${C.newsCardBorder} ${isDark ? "hover:shadow-lg hover:shadow-cyan-500/20" : "hover:shadow-md hover:shadow-sky-200/60"}`}
                    >
                      <span className={`absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? "bg-cyan-400" : "bg-sky-500"}`} />

                      <div className="flex items-center gap-2 text-2xs font-mono uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${C.newsDot}`} />
                        <span className={`truncate ${C.newsSource}`}>{item.source}</span>
                        {item.pubDate && (
                          <>
                            <span className={isDark ? "text-white/20" : "text-slate-300"}>•</span>
                            <span className={`shrink-0 ${C.newsMeta}`}>
                              {new Date(item.pubDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                            </span>
                          </>
                        )}
                      </div>
                      <p className={`text-sm font-semibold leading-snug line-clamp-3 transition-colors ${C.newsTitle}`}>
                        {item.title}
                      </p>
                      <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className={`text-2xs font-mono tracking-wider ${C.accentText}`}>DECRYPT →</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
