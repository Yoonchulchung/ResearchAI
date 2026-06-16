"use client";

import { useState } from "react";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.12em] text-slate-400">
      {children}
    </h2>
  );
}

export function ViewTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-500">
      {children}
    </span>
  );
}

export function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pb-2 pt-6">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function ExpandableCard({
  title,
  sub,
  content,
  defaultOpen = false,
}: {
  title: string;
  sub?: string;
  content?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between py-3.5 text-left"
      >
        <div className="min-w-0 pr-4">
          <p className="text-sm font-semibold leading-snug text-slate-800">{title}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {content && (
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            className={`mt-0.5 shrink-0 text-slate-300 transition-transform print:hidden ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M2 4.5L6.5 9L11 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {content && (
        <div className={`pb-4 print:block ${open ? "block" : "hidden"}`}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{content}</p>
        </div>
      )}
    </div>
  );
}
