"use client";

import type { CompanyAnalysis } from "@/lib/api/company-analysis";
import { computeReliability, RELIABILITY_META } from "../../_utils";

export function ReliabilityModal({ analysis, isDark, onClose }: { analysis: CompanyAnalysis; isDark: boolean; onClose: () => void }) {
  const { score, checks, categoryScores } = computeReliability(analysis);
  const grade = score >= 85 ? { label: "A", color: "#10b981" } : score >= 65 ? { label: "B", color: "#3b82f6" } : score >= 45 ? { label: "C", color: "#f59e0b" } : { label: "D", color: "#ef4444" };
  const bg = isDark ? "#1e293b" : "#ffffff";
  const border = isDark ? "#334155" : "#e2e8f0";
  const textMuted = isDark ? "#94a3b8" : "#64748b";
  const textBase = isDark ? "#e2e8f0" : "#1e293b";
  const barBg = isDark ? "#334155" : "#f1f5f9";
  const overlayBg = isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: overlayBg, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: 24, width: 420, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: grade.color, fontVariantNumeric: "tabular-nums" }}>{grade.label}</span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: textBase, margin: 0 }}>데이터 신뢰도 {score}%</p>
              <p style={{ fontSize: 12, color: textMuted, margin: 0 }}>수집된 데이터 출처 기반 품질 평가</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: textMuted, padding: "4px 8px" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {(Object.entries(categoryScores) as [keyof typeof RELIABILITY_META, number][]).map(([cat, pct]) => {
            const meta = RELIABILITY_META[cat];
            return (
              <div key={cat}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: textMuted }}>{meta.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: textBase, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: barBg }}>
                  <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: meta.color, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {(["official", "web", "ai"] as const).map((cat) => {
            const meta = RELIABILITY_META[cat];
            const catChecks = checks.filter((c) => c.category === cat);
            return (
              <div key={cat}>
                <p style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                  {catChecks.map((c) => (
                    <span key={c.label} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: c.ok ? textBase : (isDark ? "#475569" : "#cbd5e1") }}>
                      <span style={{ color: c.ok ? "#22c55e" : (isDark ? "#475569" : "#cbd5e1") }}>{c.ok ? "✓" : "✗"}</span>
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
