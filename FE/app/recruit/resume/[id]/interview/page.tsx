"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getResume, updateResumeInterviewScript, type ResumeTarget } from "@/lib/api/resume";
import ResumeSidebar from "../../components/ResumeSidebar";

const STOP_WORDS = new Set([
  "및", "등", "수", "것", "위한", "관련", "기반", "통해", "대한", "관리", "업무", "직무",
  "경험", "프로젝트", "역량", "지원", "기업", "회사", "고객", "서비스", "개발", "운영",
  "활용", "수행", "협업", "문제", "해결", "데이터", "시스템", "분석", "기술", "비즈니스",
]);

function tokenize(text: string) {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

function topKeywords(target: ResumeTarget) {
  const source = [
    target.jobTitle,
    target.jd,
    ...(target.selfIntroductions ?? []).flatMap((item) => [item.question, item.answer, ...(item.category ?? [])]),
    ...(target.experiences ?? []).flatMap((item) => [item.activityType, item.organizationName, item.role ?? "", item.description ?? ""]),
    ...(target.trainings ?? []).flatMap((item) => [item.title, item.institution, item.description ?? ""]),
    ...(target.prizes ?? []).flatMap((item) => [item.title, item.organization, item.description ?? ""]),
  ].join(" ");
  const counts = new Map<string, number>();
  for (const token of tokenize(source)) counts.set(token, (counts.get(token) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
  const fallback = [target.jobTitle, "지원동기", "경험 검증"].filter(Boolean) as string[];
  return [...ranked, ...fallback].filter((word, index, arr) => arr.indexOf(word) === index).slice(0, 3);
}

function compact(value: string | null | undefined, fallback: string) {
  const text = value?.trim();
  return text || fallback;
}

function buildPrepSummary(target: ResumeTarget, keywords: string[]) {
  const introCount = target.selfIntroductions?.length ?? 0;
  const expCount = (target.experiences?.length ?? 0) + (target.trainings?.length ?? 0) + (target.prizes?.length ?? 0);
  return [
    `${compact(target.companyName, "지원 기업")}의 ${compact(target.jobTitle, "지원 직무")} 관점에서 JD 요구사항과 본인 경험을 1:1로 연결해 설명할 준비가 필요합니다.`,
    introCount > 0
      ? `자기소개서 ${introCount}개 문항에서 반복되는 주장과 실제 행동 사례가 일관되는지 점검하세요.`
      : "자기소개서 문항이 없다면 지원동기, 강점, 실패 경험을 1분 답변으로 따로 준비하세요.",
    expCount > 0
      ? `교육, 활동, 수상 경험 중 ${keywords[0] ?? "핵심 역량"}을 보여주는 사례를 STAR 구조로 정리하세요.`
      : "이력서에 경험 항목이 적다면 수업, 프로젝트, 개인 학습 경험까지 확장해 근거를 준비하세요.",
    target.jd?.trim()
      ? "JD에 있는 표현을 그대로 외우기보다, 각 요구사항을 본인의 사례와 결과 수치로 바꿔 말하는 연습이 중요합니다."
      : "JD가 입력되지 않아 직무 요구사항 기반 질문 대비가 약할 수 있습니다. 채용공고를 먼저 보강하세요.",
  ];
}

function buildCompanyChecklist(target: ResumeTarget, keywords: string[]) {
  const company = compact(target.companyName, "지원 기업");
  return [
    `${company}의 핵심 제품, 서비스, 수익 구조를 한 문단으로 설명할 수 있어야 합니다.`,
    `${company}가 속한 산업의 최근 이슈와 경쟁사를 확인하고, 지원 직무가 그 이슈와 어떻게 연결되는지 정리하세요.`,
    `채용공고의 핵심 키워드인 ${keywords.join(", ")}가 실제 업무에서 어떤 의미인지 조사하세요.`,
    "최근 뉴스, 공시, 채용 페이지, 기술 블로그 또는 공식 자료에서 면접 때 언급할 만한 근거 2개를 준비하세요.",
  ];
}

function buildInterviewQuestions(target: ResumeTarget, keywords: string[]) {
  const company = compact(target.companyName, "우리 회사");
  const job = compact(target.jobTitle, "지원 직무");
  const selfIntroQuestions = (target.selfIntroductions ?? []).slice(0, 3).map((item, index) => {
    const question = item.question.trim() || `자기소개서 ${index + 1}번 문항`;
    return `"${question.slice(0, 42)}${question.length > 42 ? "..." : ""}"에 쓴 사례를 면접에서 다시 설명한다면 핵심 근거는 무엇인가요?`;
  });

  const technical = [
    {
      group: "직무 이해",
      items: [
        `${job}에서 가장 중요하다고 생각하는 기술/직무 역량은 무엇이고, 본인은 어떻게 준비했나요?`,
        `JD에서 확인한 업무 중 가장 자신 있는 영역과 보완이 필요한 영역을 말해 주세요.`,
        `채용공고의 핵심 키워드인 ${keywords.join(", ")}를 실제 업무 상황에 적용한다면 어떻게 설명할 수 있나요?`,
      ],
    },
    {
      group: "프로젝트/경험 검증",
      items: [
        `${keywords[0] ?? "핵심 역량"}을 활용해 문제를 해결했던 경험을 구체적으로 설명해 주세요.`,
        "본인이 맡은 역할, 사용한 방법, 결과 지표를 순서대로 설명해 주세요.",
        "기술적 또는 실무적으로 막혔던 지점과 그때의 판단 기준은 무엇이었나요?",
      ],
    },
    {
      group: "기업/업무 적용",
      items: [
        `${company}의 제품이나 서비스에서 ${job}가 기여할 수 있는 부분은 무엇이라고 보나요?`,
        "입사 후 3개월 안에 빠르게 파악해야 할 업무/기술/도메인은 무엇이라고 생각하나요?",
      ],
    },
  ];

  const hr = [
    {
      group: "지원동기/조직 적합성",
      items: [
        `${company}와 ${job}를 선택한 이유를 본인의 경험과 연결해 설명해 주세요.`,
        `${company}의 사업이나 서비스 중 가장 관심 있게 본 부분은 무엇인가요?`,
        "본인이 일할 때 중요하게 생각하는 기준과 이 회사가 맞는 이유는 무엇인가요?",
      ],
    },
    {
      group: "인성/행동",
      items: [
        "갈등이나 어려운 상황에서 본인이 맡은 역할, 선택한 행동, 결과를 말해 주세요.",
        "실패했던 경험에서 원인을 어떻게 분석했고 이후 무엇을 바꾸었나요?",
        "동료와 의견이 다를 때 어떻게 조율하는 편인가요?",
      ],
    },
    {
      group: "자기소개서 기반",
      items: selfIntroQuestions,
    },
  ];

  const normalize = (sections: typeof hr) => sections.map((section) => ({
    ...section,
    items: section.items.length > 0 ? section.items : ["자기소개서 내용을 기반으로 추가 질문을 준비하세요."],
  }));

  return {
    technical: normalize(technical),
    hr: normalize(hr),
  };
}

function KeywordCard({ keyword, index }: { keyword: string; index: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-600">Keyword {index + 1}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{keyword}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        이 키워드를 보여주는 경험 1개, 배운 점 1개, 입사 후 활용 방향 1개를 준비하세요.
      </p>
    </div>
  );
}

function InterviewPrepContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const [target, setTarget] = useState<ResumeTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [error, setError] = useState("");
  const [interviewScript, setInterviewScript] = useState("");
  const [scriptSaving, setScriptSaving] = useState(false);
  const [scriptSaved, setScriptSaved] = useState(false);
  const [scriptError, setScriptError] = useState("");

  const loadInterviewPrep = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setReanalyzing(true);
    try {
      const profile = await getResume(id);
      const selected = profile?.resumeTargets?.find((item) => item.id === id) ?? null;
      if (!selected) throw new Error("이력서를 찾을 수 없습니다.");
      setTarget(selected);
      setInterviewScript(selected.interviewScript ?? "");
      setScriptSaved(false);
      setScriptError("");
      setError("");
    } catch (err) {
      if (initial) setTarget(null);
      setError(err instanceof Error ? err.message : "면접 준비 정보를 불러오지 못했습니다.");
    } finally {
      if (initial) setLoading(false);
      else setReanalyzing(false);
    }
  }, [id]);

  useEffect(() => {
    void loadInterviewPrep(true);
  }, [loadInterviewPrep]);

  const handleReanalyze = useCallback(() => {
    if (reanalyzing) return;
    void loadInterviewPrep(false);
  }, [loadInterviewPrep, reanalyzing]);

  const handleSaveInterviewScript = useCallback(async () => {
    if (!target || scriptSaving) return;
    setScriptSaving(true);
    setScriptSaved(false);
    setScriptError("");
    try {
      const result = await updateResumeInterviewScript(target.id, interviewScript);
      setInterviewScript(result.interviewScript);
      setTarget((current) => current ? { ...current, interviewScript: result.interviewScript } : current);
      setScriptSaved(true);
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : "면접 스크립트 저장에 실패했습니다.");
    } finally {
      setScriptSaving(false);
    }
  }, [interviewScript, scriptSaving, target]);

  const prep = useMemo(() => {
    if (!target) return null;
    const keywords = topKeywords(target);
    return {
      keywords,
      summary: buildPrepSummary(target, keywords),
      checklist: buildCompanyChecklist(target, keywords),
      questions: buildInterviewQuestions(target, keywords),
    };
  }, [target]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">면접 준비 정보를 불러오는 중...</div>;
  }

  if (!target || !prep) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
        <p className="text-sm">{error || "이력서를 찾을 수 없습니다."}</p>
        <button onClick={() => router.push("/recruit/resume")} className="text-xs font-semibold text-emerald-700 hover:underline">
          이력서 목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/recruit/resume/${encodeURIComponent(id)}`)}
            className="text-slate-300 transition-colors hover:text-slate-700"
            aria-label="이력서로 돌아가기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black text-slate-950">면접 준비</h1>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {target.companyName || "기업명 미입력"} {target.jobTitle ? `· ${target.jobTitle}` : ""}
            </p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reanalyzing ? (
              <span className="h-3 w-3 rounded-full border-2 border-emerald-100 border-t-emerald-700 animate-spin" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M9.8 4.3A4 4 0 1 0 10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M8.4 1.8h2.1v2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {reanalyzing ? "재분석 중" : "재분석 요청"}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8">
            <section className="rounded-md border border-slate-200 bg-white px-6 py-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">Interview Prep</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                {target.companyName || "지원 기업"} 면접 준비 노트
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                저장된 이력서, 채용공고, 자기소개서, 경험 항목을 바탕으로 면접 전에 확인할 내용을 정리했습니다.
              </p>
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-3">
              {prep.keywords.map((keyword, index) => (
                <KeywordCard key={`${keyword}-${index}`} keyword={keyword} index={index} />
              ))}
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-md border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-black text-slate-950">면접 준비 포인트 요약</h3>
                <div className="mt-4 space-y-3">
                  {prep.summary.map((item) => (
                    <div key={item} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-sm bg-emerald-500" />
                      <p className="text-sm leading-7 text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-black text-slate-950">지원 전에 기업에 대해 알아야 하는 점</h3>
                <div className="mt-4 space-y-3">
                  {prep.checklist.map((item) => (
                    <div key={item} className="flex gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-[11px] font-black text-slate-500">✓</span>
                      <p className="text-sm leading-7 text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-md border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-950">예상 질문</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-400">HR 면접과 기술/직무 면접을 분리해서 준비하세요.</p>
                </div>
                <span className="rounded-sm bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                  {[...prep.questions.hr, ...prep.questions.technical].reduce((sum, section) => sum + section.items.length, 0)}문항
                </span>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-slate-950">HR 면접</h4>
                    <span className="rounded-sm bg-white px-2 py-1 text-[11px] font-black text-slate-500">
                      {prep.questions.hr.reduce((sum, section) => sum + section.items.length, 0)}문항
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-400">지원동기, 조직 적합성, 인성/행동, 자소서 검증</p>
                  <div className="mt-4 grid gap-3">
                    {prep.questions.hr.map((section) => (
                      <div key={section.group} className="rounded-md border border-slate-100 bg-white p-4">
                        <h5 className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{section.group}</h5>
                        <ol className="mt-3 space-y-3">
                          {section.items.map((question, index) => (
                            <li key={question} className="flex gap-3">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-slate-50 text-[11px] font-black text-slate-500">
                                {index + 1}
                              </span>
                              <p className="text-sm leading-7 text-slate-700">{question}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-slate-950">기술 면접</h4>
                    <span className="rounded-sm bg-white px-2 py-1 text-[11px] font-black text-emerald-700">
                      {prep.questions.technical.reduce((sum, section) => sum + section.items.length, 0)}문항
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-emerald-700/70">JD 이해, 직무 역량, 프로젝트/경험 검증, 업무 적용</p>
                  <div className="mt-4 grid gap-3">
                    {prep.questions.technical.map((section) => (
                      <div key={section.group} className="rounded-md border border-emerald-100 bg-white p-4">
                        <h5 className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">{section.group}</h5>
                        <ol className="mt-3 space-y-3">
                          {section.items.map((question, index) => (
                            <li key={question} className="flex gap-3">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-[11px] font-black text-emerald-700">
                                {index + 1}
                              </span>
                              <p className="text-sm leading-7 text-slate-700">{question}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>

            <section className="mt-6 rounded-md border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-950">JD와 작성한 자기소개서</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-400">면접 답변을 준비할 때 원문 근거를 함께 확인하세요.</p>
                </div>
                <span className="rounded-sm bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
                  {(target.selfIntroductions ?? []).length}문항
                </span>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <article className="rounded-md border border-slate-100 bg-slate-50 p-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">JD</h4>
                  {target.jd?.trim() ? (
                    <p className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {target.jd}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-slate-400">채용공고 JD가 입력되지 않았습니다.</p>
                  )}
                </article>

                <article className="rounded-md border border-slate-100 bg-slate-50 p-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">작성한 자기소개서</h4>
                  {(target.selfIntroductions ?? []).length > 0 ? (
                    <div className="mt-3 flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
                      {(target.selfIntroductions ?? []).map((intro, index) => (
                        <div key={intro.id || index} className="rounded-md border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-xs font-black text-slate-500">문항 {index + 1}</p>
                            <span className="text-[11px] font-semibold text-slate-400">
                              공백 포함 {intro.answer.length.toLocaleString()}자
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-7 text-slate-800">
                            {intro.question || "문항이 입력되지 않았습니다."}
                          </p>
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                              {intro.answer || "답변이 입력되지 않았습니다."}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-slate-400">작성된 자기소개서가 없습니다.</p>
                  )}
                </article>
              </div>
            </section>

            <section className="mt-6 rounded-md border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-950">면접 스크립트</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-400">직접 답변 스크립트를 작성하고 저장하세요.</p>
                </div>
                <div className="flex items-center gap-2">
                  {scriptSaved && <span className="text-xs font-bold text-emerald-700">저장됨</span>}
                  <button
                    type="button"
                    onClick={handleSaveInterviewScript}
                    disabled={scriptSaving}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {scriptSaving && <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                    {scriptSaving ? "저장 중" : "스크립트 저장"}
                  </button>
                </div>
              </div>
              <textarea
                value={interviewScript}
                onChange={(event) => {
                  setInterviewScript(event.target.value);
                  setScriptSaved(false);
                }}
                rows={12}
                placeholder="예: 1분 자기소개, 지원동기, HR 질문 답변, 기술 질문 답변을 직접 작성하세요."
                className="mt-4 min-h-72 w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-400">
                  공백 포함 {interviewScript.length.toLocaleString()}자 · 공백 제외 {interviewScript.replace(/\s/g, "").length.toLocaleString()}자
                </p>
                {scriptError && <p className="text-xs font-semibold text-red-500">{scriptError}</p>}
              </div>
            </section>
          </div>
        </div>
        <ResumeSidebar resumeId={target.id} target={target} />
      </main>
    </div>
  );
}

export default function ResumeInterviewPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">면접 준비 정보를 불러오는 중...</div>}>
      <InterviewPrepContent />
    </Suspense>
  );
}
