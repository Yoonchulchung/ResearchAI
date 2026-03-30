"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface ConflictZone {
  code: string;
  score: number;
  headlines: string[];
}

// ISO numeric → display info
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

// ─── 폰트 크기 개별 조정 ─────────────────────────────────────────────────────
const FONT = {
  cardTitle:       'text-base',   // "글로벌 뉴스 지도"
  conflictBadge:   'text-sm',    // "N개 분쟁 지역 감지"
  legend:          'text-xs',    // 범례 레이블
  tooltip:         'text-xs',    // 툴팁 국가명
  tooltipNote:     'text-2xs',   // 툴팁 분쟁 설명
  tooltipHeadline: 'text-micro', // 툴팁 헤드라인
  sectionTitle:    'text-sm',    // 선택 국가 뉴스 제목
  warNote:         'text-sm',    // 분쟁 설명
  researchBtn:     'text-xs2',   // "+ 리서치 시작" 버튼
  newsTitle:       'text-xs2',   // 뉴스 카드 제목
  newsMeta:        'text-xs',    // 뉴스 출처·날짜
  emptyState:      'text-xs',    // "뉴스를 불러올 수 없습니다"
} as const;
// ─────────────────────────────────────────────────────────────────────────────

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
  x: number;
  y: number;
}

export function WorldMapCard() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedCountry | null>(null);
  const [news, setNews] = useState<CountryNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; warNote?: string; headlines?: string[] } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [conflictMap, setConflictMap] = useState<Map<string, ConflictZone>>(new Map());
  const [conflictLoading, setConflictLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:3001/api/news/conflict-zones")
      .then((r) => r.json())
      .then((data: ConflictZone[]) => {
        const map = new Map<string, ConflictZone>();
        for (const zone of data) map.set(zone.code, zone);
        setConflictMap(map);
      })
      .catch(() => {/* keep empty map */})
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
    if (selected) fetchCountryNews(selected.query);
  }, [selected, fetchCountryNews]);

  const handleGeoClick = useCallback((geo: { id: string }, evt: React.MouseEvent) => {
    const id = String(geo.id);
    const info = COUNTRY_INFO[id];
    if (!info) return;

    const rect = cardRef.current?.getBoundingClientRect();
    const x = rect ? evt.clientX - rect.left : evt.clientX;
    const y = rect ? evt.clientY - rect.top : evt.clientY;

    const conflict = conflictMap.get(id);
    const warNote = conflict ? (info.warNote ?? `분쟁 강도 ${conflict.score}`) : info.warNote;
    setSelected({ id, name: info.name, query: info.query, warNote, x, y });
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

  const getGeoColor = (id: string) => {
    const conflict = conflictMap.get(id);
    const isWar = !!conflict;
    const isHovered = hoveredId === id;
    const isSelected_ = selected?.id === id;
    const hasInfo = !!COUNTRY_INFO[id];

    if (isWar) {
      // Intensity based on score: higher score = deeper red
      const score = conflict!.score;
      if (isSelected_) return "#dc2626";
      if (isHovered) return "#ef4444";
      if (score >= 5) return "#f87171"; // high intensity
      if (score >= 2) return "#fca5a5"; // medium
      return "#fecaca"; // low intensity
    }
    if (isSelected_) return "#6366f1";
    if (isHovered && hasInfo) return "#a5b4fc";
    if (hasInfo) return "#c7d2fe";
    return "#e2e8f0";
  };

  return (
    <div ref={cardRef} className="glass-panel rounded-2xl p-5 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className={`${FONT.cardTitle} font-bold text-slate-700`}>글로벌 뉴스 지도</h2>
          {conflictLoading && (
            <span className="text-2xs text-slate-400 animate-pulse">분쟁 분석 중...</span>
          )}
          {!conflictLoading && conflictMap.size > 0 && (
            <span className={`${FONT.conflictBadge} text-red-500 font-semibold`}>{conflictMap.size}개 분쟁 지역 감지</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <span className={`flex items-center gap-1 ${FONT.legend}`}>
            <span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> 전쟁·분쟁 지역
          </span>
          <span className={`flex items-center gap-1 ${FONT.legend}`}>
            <span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> 클릭 가능
          </span>
          {selected && (
            <button
              onClick={() => { setSelected(null); setNews([]); }}
              className="font-xs2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              ✕ 닫기
            </button>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="relative" onMouseLeave={() => { setTooltip(null); setHoveredId(null); }}>
        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{ scale: 153, center: [10, 0] }}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup zoom={1} minZoom={0.8} maxZoom={4}>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ rsmKey: string; id: string }> }) =>
                geographies.map((geo) => {
                  const id = String(geo.id);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getGeoColor(id)}
                      stroke="#ffffff"
                      strokeWidth={0.4}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", cursor: COUNTRY_INFO[id] ? "pointer" : "default" },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={(evt: React.MouseEvent) => {
                        setHoveredId(id);
                        handleMouseMove(geo, evt);
                      }}
                      onMouseMove={(evt: React.MouseEvent) => handleMouseMove(geo, evt)}
                      onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
                      onClick={(evt: React.MouseEvent) => handleGeoClick(geo, evt)}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Tooltip */}
        {tooltip && (
          <div
            className={`pointer-events-none absolute z-20 bg-slate-800 text-white ${FONT.tooltip} px-2.5 py-1.5 rounded-lg shadow-lg max-w-56`}
            style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
          >
            <p className="font-semibold">{tooltip.name}</p>
            {tooltip.warNote && (
              <p className={`text-red-300 ${FONT.tooltipNote} mt-0.5`}>⚔️ {tooltip.warNote}</p>
            )}
            {tooltip.headlines && tooltip.headlines.length > 0 && (
              <p className={`text-slate-300 ${FONT.tooltipHeadline} mt-1 line-clamp-2 leading-snug`}>{tooltip.headlines[0]}</p>
            )}
          </div>
        )}
      </div>

      {/* Selected country news panel */}
      {selected && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className={`${FONT.sectionTitle} font-bold text-slate-700 flex items-center gap-2`}>
                {selected.name} 주요 뉴스
              </h3>
              {selected.warNote && (
                <p className={`${FONT.warNote} text-red-500 mt-0.5`}>{selected.warNote}</p>
              )}
            </div>
            <button
              onClick={() => {
                sessionStorage.setItem("dashboard-topic", selected.name + " 최신 뉴스");
                router.push("/sessions/new");
              }}
              className={`${FONT.researchBtn} font-semibold text-indigo-600 hover:text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors shrink-0`}
            >
              + 리서치 시작
            </button>
          </div>

          {newsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <p className={`${FONT.emptyState} text-slate-400 text-center py-4`}>뉴스를 불러올 수 없습니다</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {news.map((item, i) => (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1 p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all"
                >
                  <p className={`${FONT.newsTitle} font-medium text-slate-700 group-hover:text-indigo-700 leading-snug line-clamp-2 transition-colors`}>
                    {item.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-auto">
                    <span className={`${FONT.newsMeta} text-slate-400 truncate`}>{item.source}</span>
                    {item.pubDate && (
                      <>
                        <span className={`${FONT.newsMeta} text-slate-300`}>·</span>
                        <span className={`${FONT.newsMeta} text-slate-400 shrink-0`}>
                          {new Date(item.pubDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
