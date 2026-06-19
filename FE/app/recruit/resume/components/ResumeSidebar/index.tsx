"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { streamWriteAssist } from "@/lib/api/ai";
import { enqueueRecruitAssist } from "@/lib/api/recruit/assist";
import {
  getResumeAiEvals,
  upsertResumeAiEval,
  deleteResumeAiEval,
  type ResumeExperience,
  type ResumePrize,
  type ResumeTraining,
  type ResumeTarget,
  type ResumeSelfIntro,
} from "@/lib/api/resume";
import { useAuth } from "@/contexts/AuthContext";
import { MODELS } from "@/recruit/_constants";
import CompanyAnalysisPanel from "../CompanyAnalysisPanel";
import ResumeSearchPanel from "../../write/components/ResumeSearchPanel";
import {
  CompanyNewsPanel,
  CoverLetterBrowsePanel,
  EvalListPanel,
  JdEvalPanel,
  type EvalItem,
  type EvalItemType,
  type SidebarTab,
} from "./panels";

export interface ResumeSidebarRef {
  startEval: (
    subjectKey: string,
    title: string,
    content: string,
    model: string,
    action?: string,
  ) => void;
}

interface Props {
  resumeId: string;
  target: ResumeTarget;
  onInsertSelfIntro?: (si: ResumeSelfIntro) => void;
  onInsertExperience?: (exp: ResumeExperience) => void;
  onInsertPrize?: (prize: ResumePrize) => void;
  onInsertTraining?: (training: ResumeTraining) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Sidebar
// ────────────────────────────────────────────────────────────────────────────

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "company", label: "기업 분석" },
  { id: "jd", label: "JD 평가" },
  { id: "eval", label: "글 평가" },
  { id: "search", label: "경험" },
  { id: "covers", label: "합격 자소서" },
  { id: "news", label: "기업 뉴스" },
];

const ResumeSidebar = forwardRef<ResumeSidebarRef, Props>(
  function ResumeSidebar(
    {
      resumeId,
      target,
      onInsertSelfIntro,
      onInsertExperience,
      onInsertPrize,
      onInsertTraining,
    },
    ref,
  ) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<SidebarTab>("company");
    const [evals, setEvals] = useState<EvalItem[]>([]);
    const savedEvalsRef = useRef<Map<string, string>>(new Map());
    const abortRefs = useRef<Map<string, AbortController>>(new Map());
    const evalRunTokenRef = useRef(0);

    const defaultModel = user?.defaultCloudModel ?? MODELS[0]?.id ?? "";
    const latestTargetRef = useRef(target);
    const defaultModelRef = useRef(defaultModel);

    useEffect(() => {
      latestTargetRef.current = target;
    }, [target]);

    useEffect(() => {
      defaultModelRef.current = defaultModel;
    }, [defaultModel]);

    // Load persisted evals for the active resume. Keep this detached from live
    // editor changes so an in-flight AI response is not replaced by saved results.
    useEffect(() => {
      if (!resumeId) {
        savedEvalsRef.current.clear();
        setEvals([]);
        return;
      }
      let cancelled = false;
      const loadTarget = latestTargetRef.current;
      const fallbackModel = defaultModelRef.current;
      savedEvalsRef.current.clear();
      setEvals([]);

      getResumeAiEvals(resumeId)
        .then((list) => {
          if (cancelled) return;
          const evalItems: EvalItem[] = list
            .filter(
              (e) =>
                e.type === "evaluate" ||
                e.type === "spellcheck" ||
                e.type === "example",
            )
            .map((e) => {
              const si = loadTarget.selfIntroductions.find(
                (s) => s.id === e.subjectKey,
              );
              const idx = loadTarget.selfIntroductions.findIndex(
                (s) => s.id === e.subjectKey,
              );
              const experience = loadTarget.experiences?.find(
                (item) => item.id === e.subjectKey,
              );
              const training = loadTarget.trainings?.find(
                (item) => item.id === e.subjectKey,
              );
              const prize = loadTarget.prizes?.find(
                (item) => item.id === e.subjectKey,
              );
              const typeLabel =
                e.type === "spellcheck"
                  ? " (맞춤법)"
                  : e.type === "example"
                    ? " (작성 방향)"
                    : "";
              const actionLabel =
                e.type === "spellcheck"
                  ? "맞춤법 검사"
                  : e.type === "example"
                    ? "작성 방향"
                    : "글 평가";
              const fallbackTitle = (() => {
                if (e.subjectKey === `${loadTarget.id}-jd`)
                  return `JD ${actionLabel}`;
                if (experience) {
                  return experience.activityType === "해외 경험"
                    ? `해외 활동 ${actionLabel}`
                    : `학내외활동 ${actionLabel}`;
                }
                if (training) return `교육이수사항 ${actionLabel}`;
                if (prize) return `수상 ${actionLabel}`;
                return `문항 ${idx + 1}${typeLabel}`;
              })();
              return {
                subjectKey: e.subjectKey,
                type: e.type as EvalItemType,
                title: si?.question
                  ? `문항 ${idx + 1}: ${si.question.slice(0, 30)}${typeLabel}`
                  : fallbackTitle,
                result: e.result,
                loading: false,
                error: null,
                model: e.model ?? fallbackModel,
              };
            });
          setEvals((prev) => {
            const persistedKeys = new Set(
              evalItems.map((item) => `${item.subjectKey}-${item.type}`),
            );
            const persistedWithActiveRunsPreserved = evalItems.map((item) => {
              const activeItem = prev.find(
                (prevItem) =>
                  prevItem.subjectKey === item.subjectKey &&
                  prevItem.type === item.type &&
                  prevItem.runToken !== undefined,
              );
              return activeItem ?? item;
            });
            const activeOnlyItems = prev.filter(
              (item) =>
                item.runToken !== undefined &&
                !persistedKeys.has(`${item.subjectKey}-${item.type}`),
            );
            return [...persistedWithActiveRunsPreserved, ...activeOnlyItems];
          });
          for (const e of list)
            savedEvalsRef.current.set(`${e.subjectKey}-${e.type}`, e.id);
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [resumeId]);

    const runEval = useCallback(
      async (
        subjectKey: string,
        title: string,
        content: string,
        model: string,
        action: string = "evaluate",
      ) => {
        const itemType = action as EvalItemType;
        abortRefs.current.get(`${subjectKey}-${action}`)?.abort();
        const ctrl = new AbortController();
        abortRefs.current.set(`${subjectKey}-${action}`, ctrl);
        const runToken = ++evalRunTokenRef.current;

        setEvals((prev) => {
          const exists = prev.find(
            (e) => e.subjectKey === subjectKey && e.type === itemType,
          );
          if (exists)
            return prev.map((e) =>
              e.subjectKey === subjectKey && e.type === itemType
                ? {
                    ...e,
                    result: "",
                    loading: true,
                    error: null,
                    model,
                    runToken,
                  }
                : e,
            );
          return [
            ...prev,
            {
              subjectKey,
              type: itemType,
              title,
              result: "",
              loading: true,
              error: null,
              model,
              runToken,
            },
          ];
        });

        let fullResult = "";
        try {
          const { jobId } = await enqueueRecruitAssist(action, content, model);
          await streamWriteAssist(
            jobId,
            (event) => {
              if (ctrl.signal.aborted) return;
              if (event.type === "chunk") {
                setEvals((prev) =>
                  prev.map((e) =>
                    e.subjectKey === subjectKey && e.type === itemType
                      ? { ...e, result: e.result + event.text }
                      : e,
                  ),
                );
                fullResult += event.text;
              } else if (event.type === "error") {
                setEvals((prev) =>
                  prev.map((e) =>
                    e.subjectKey === subjectKey && e.type === itemType
                      ? { ...e, error: event.message || "오류", loading: false }
                      : e,
                  ),
                );
              }
            },
            ctrl.signal,
          );
          if (!ctrl.signal.aborted) {
            setEvals((prev) =>
              prev.map((e) =>
                e.subjectKey === subjectKey && e.type === itemType
                  ? { ...e, loading: false }
                  : e,
              ),
            );
            if (fullResult) {
              upsertResumeAiEval(resumeId, {
                subjectKey,
                type: action,
                result: fullResult,
                model,
              })
                .then((saved) => {
                  savedEvalsRef.current.set(
                    `${subjectKey}-${action}`,
                    saved.id,
                  );
                })
                .catch(() => {});
            }
          }
        } catch (e) {
          if (!ctrl.signal.aborted) {
            setEvals((prev) =>
              prev.map((ev) =>
                ev.subjectKey === subjectKey && ev.type === itemType
                  ? {
                      ...ev,
                      error: e instanceof Error ? e.message : "오류",
                      loading: false,
                    }
                  : ev,
              ),
            );
          }
        }
      },
      [resumeId],
    );

    useImperativeHandle(
      ref,
      () => ({
        startEval(subjectKey, title, content, model, action = "evaluate") {
          setActiveTab("eval");
          runEval(subjectKey, title, content, model, action);
        },
      }),
      [runEval],
    );

    const handleDeleteEval = useCallback((subjectKey: string, type: string) => {
      setEvals((prev) =>
        prev.filter((e) => !(e.subjectKey === subjectKey && e.type === type)),
      );
      const key = `${subjectKey}-${type}`;
      const dbId = savedEvalsRef.current.get(key);
      if (dbId) {
        deleteResumeAiEval(dbId).catch(() => {});
        savedEvalsRef.current.delete(key);
      }
    }, []);

    const handleReorderEval = useCallback((fromKey: string, toKey: string) => {
      setEvals((prev) => {
        const fromIndex = prev.findIndex(
          (item) => `${item.subjectKey}-${item.type}` === fromKey,
        );
        const toIndex = prev.findIndex(
          (item) => `${item.subjectKey}-${item.type}` === toKey,
        );
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    }, []);

    return (
      <div className="hidden md:flex flex-col w-96 xl:w-105 shrink-0 border-l border-slate-100 print:hidden">
        {/* Horizontally scrollable tabs */}
        <div className="shrink-0 flex border-b border-slate-100 bg-white overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3 py-2.5 text-xs2 font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-indigo-600 border-indigo-500"
                  : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {tab.label}
              {tab.id === "eval" && evals.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-sm bg-indigo-100 text-indigo-600 text-micro font-bold">
                  {evals.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab panels — always mounted, hidden when inactive */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div
            className={`absolute inset-0 ${activeTab === "company" ? "flex flex-col" : "hidden"}`}
          >
            <CompanyAnalysisPanel initialQuery={target.companyName ?? ""} />
          </div>
          <div
            className={`absolute inset-0 ${activeTab === "jd" ? "flex flex-col" : "hidden"}`}
          >
            <JdEvalPanel target={target} resumeId={resumeId} models={MODELS} />
          </div>
          <div
            className={`absolute inset-0 ${activeTab === "eval" ? "flex flex-col" : "hidden"}`}
          >
            <EvalListPanel
              target={target}
              evals={evals}
              models={MODELS}
              onUpdate={(sk, mdl, content, action) => {
                const item = evals.find((e) => e.subjectKey === sk);
                runEval(sk, item?.title ?? "", content, mdl, action);
              }}
              onDelete={handleDeleteEval}
              onReorder={handleReorderEval}
            />
          </div>
          <div
            className={`absolute inset-0 ${activeTab === "search" ? "flex flex-col" : "hidden"}`}
          >
            <ResumeSearchPanel
              resumeId={resumeId}
              onInsertSelfIntro={onInsertSelfIntro}
              onInsertExperience={onInsertExperience}
              onInsertPrize={onInsertPrize}
              onInsertTraining={onInsertTraining}
            />
          </div>
          <div
            className={`absolute inset-0 ${activeTab === "covers" ? "flex flex-col" : "hidden"}`}
          >
            <CoverLetterBrowsePanel
              companyName={target.companyName}
              onInsertSelfIntro={onInsertSelfIntro}
            />
          </div>
          <div
            className={`absolute inset-0 ${activeTab === "news" ? "flex flex-col" : "hidden"}`}
          >
            <CompanyNewsPanel target={target} resumeId={resumeId} />
          </div>
        </div>
      </div>
    );
  },
);

export default ResumeSidebar;
