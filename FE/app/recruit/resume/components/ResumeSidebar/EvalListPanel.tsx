"use client";

import { useEffect, useRef, useState } from "react";
import type { ResumeTarget } from "@/lib/api/resume";
import type { EvalItem } from "./types";
import { EvalCard } from "./EvalCard";

export function EvalListPanel({
  target,
  evals,
  models,
  onUpdate,
  onDelete,
  onReorder,
}: {
  target: ResumeTarget;
  evals: EvalItem[];
  models: { id: string; name: string }[];
  onUpdate: (
    subjectKey: string,
    model: string,
    content: string,
    action: string,
  ) => void;
  onDelete: (subjectKey: string, type: string) => void;
  onReorder: (fromKey: string, toKey: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const seenRunTokensRef = useRef<Map<string, number>>(new Map());
  const manuallyClosedRunTokensRef = useRef<Map<string, number>>(new Map());
  const buildProfileSectionEvaluationContent = (
    sectionLabel: string,
    fields: Array<[string, string | null | undefined]>,
    description: string,
  ) => {
    const isOverseas = sectionLabel === "해외 활동";
    const base = [
      !isOverseas && target.companyName ? `기업명: ${target.companyName}` : "",
      !isOverseas && target.jobTitle ? `직무: ${target.jobTitle}` : "",
      !isOverseas && target.jd ? `채용공고 JD:\n${target.jd}` : "",
      `평가 대상: ${sectionLabel}`,
      ...fields.map(([label, value]) =>
        value?.trim() ? `${label}: ${value}` : "",
      ),
      `작성 내용:\n${description}`,
    ];
    const request = isOverseas
      ? [
          "요청: 이 항목은 직무 적합도 점수 평가가 아니라 지원자를 소개하는 해외 경험 소재 평가입니다.",
          "기업/JD/직무와 억지로 연결하지 말고, 해외 경험 자체가 지원자를 어떤 사람으로 보여주는지 평가해주세요.",
          "먼저 기업 일반이 해외 활동 항목에서 확인하려는 이유를 추출해주세요. 예: 낯선 환경 적응력과 생존력, 열린 시각과 문화적 다양성, 주도성과 독립성, 글로벌 협업 감각, 언어/문화 장벽을 다루는 방식 등.",
          "그 다음 현재 작성 내용이 위 신호를 얼마나 보여주는지 평가해주세요.",
          "반드시 '추가 추천' 섹션을 만들어, 더 넣으면 좋은 개인 경험 소재를 제안해주세요. 예: 어떤 낯선 문제 상황, 문화 차이, 독립적으로 해결한 일, 현지인/국제 팀과의 소통, 실패 후 적응한 과정, 관점 변화.",
          "완성본 대필보다 작성자가 직접 보강할 수 있는 방향, 질문 목록, 강조 키워드 중심으로 답해주세요.",
        ].join(" ")
      : [
          "요청: 이 항목은 직무 적합도 점수 평가가 아니라 지원자를 소개하는 경험 소재 평가입니다.",
          "이 경험이 어떤 사람으로 보이게 하는지, 강점과 성향이 충분히 드러나는지, 빠진 맥락은 무엇인지 봐주세요.",
          "기업/JD/직무와 연결해 추가하면 좋은 내용, 강조하면 좋은 키워드, 보완 방향을 제안해주세요.",
          "완성본 대필보다 작성자가 직접 고칠 수 있는 방향 중심으로 답해주세요.",
        ].join(" ");
    return [...base, request].filter(Boolean).join("\n\n");
  };

  useEffect(() => {
    if (evals.length === 0) {
      setOpenKey(null);
      seenRunTokensRef.current.clear();
      manuallyClosedRunTokensRef.current.clear();
      return;
    }

    const existingKeys = new Set(
      evals.map((item) => `${item.subjectKey}-${item.type}`),
    );
    for (const key of seenRunTokensRef.current.keys()) {
      if (!existingKeys.has(key)) seenRunTokensRef.current.delete(key);
    }
    for (const key of manuallyClosedRunTokensRef.current.keys()) {
      if (!existingKeys.has(key))
        manuallyClosedRunTokensRef.current.delete(key);
    }

    let newlyStartedItem: EvalItem | undefined;
    for (const item of evals) {
      const itemKey = `${item.subjectKey}-${item.type}`;
      const token = item.runToken ?? 0;
      const previousToken = seenRunTokensRef.current.get(itemKey);
      seenRunTokensRef.current.set(itemKey, token);
      if (previousToken === token || newlyStartedItem) continue;
      const manuallyClosedToken =
        manuallyClosedRunTokensRef.current.get(itemKey);
      if (manuallyClosedToken === token) continue;
      newlyStartedItem = item;
    }

    if (newlyStartedItem) {
      setOpenKey(`${newlyStartedItem.subjectKey}-${newlyStartedItem.type}`);
      return;
    }

    setOpenKey((current) => {
      if (current === null) return null;
      if (current && existingKeys.has(current)) return current;
      const next = evals[0];
      return `${next.subjectKey}-${next.type}`;
    });
  }, [evals]);

  if (evals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          className="text-slate-200"
        >
          <path
            d="M16 4l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm text-slate-400">
          자소서, 학내외활동, 수상, 해외 활동에서
          <br />
          AI 도움을 받아보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden bg-slate-50/60">
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 py-4 flex flex-col gap-4">
        {evals.map((item) => {
          const itemKey = `${item.subjectKey}-${item.type}`;
          return (
            <EvalCard
              key={itemKey}
              item={item}
              models={models}
              itemKey={itemKey}
              open={openKey === itemKey}
              dragging={dragKey === itemKey}
              dragOver={dragOverKey === itemKey && dragKey !== itemKey}
              onToggle={() => {
                setOpenKey((current) => {
                  if (current === itemKey) {
                    manuallyClosedRunTokensRef.current.set(
                      itemKey,
                      item.runToken ?? 0,
                    );
                    return null;
                  }
                  manuallyClosedRunTokensRef.current.delete(itemKey);
                  return itemKey;
                });
              }}
              onDragStart={(event) => {
                setDragKey(itemKey);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", itemKey);
              }}
              onDragOver={(event) => {
                if (!dragKey || dragKey === itemKey) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverKey(itemKey);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromKey =
                  dragKey ?? event.dataTransfer.getData("text/plain");
                setDragKey(null);
                setDragOverKey(null);
                if (!fromKey || fromKey === itemKey) return;
                onReorder(fromKey, itemKey);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDragOverKey(null);
              }}
              onRerun={(sk, mdl) => {
                manuallyClosedRunTokensRef.current.delete(itemKey);
                setOpenKey(itemKey);
                if (item.type === "spellcheck") {
                  const si = target.selfIntroductions.find((s) => s.id === sk);
                  const experience = target.experiences?.find(
                    (entry) => entry.id === sk,
                  );
                  const training = target.trainings?.find(
                    (entry) => entry.id === sk,
                  );
                  const prize = target.prizes?.find((entry) => entry.id === sk);
                  const content =
                    si?.answer ??
                    (sk === `${target.id}-jd` ? target.jd : undefined) ??
                    experience?.description ??
                    training?.description ??
                    prize?.description ??
                    "";
                  if (!content.trim()) return;
                  onUpdate(sk, mdl, content, "spellcheck");
                  return;
                }
                if (item.type === "evaluate") {
                  const experience = target.experiences?.find(
                    (entry) => entry.id === sk,
                  );
                  const training = target.trainings?.find(
                    (entry) => entry.id === sk,
                  );
                  const prize = target.prizes?.find((entry) => entry.id === sk);
                  if (experience) {
                    const isOverseas = experience.activityType === "해외 경험";
                    const content = buildProfileSectionEvaluationContent(
                      isOverseas ? "해외 활동" : "학내외활동",
                      isOverseas
                        ? [
                            ["해외경험 목적", experience.role],
                            ["국가", experience.organizationName],
                            [
                              "해외경험 기간",
                              [experience.startDate, experience.endDate]
                                .filter(Boolean)
                                .join(" ~ "),
                            ],
                          ]
                        : [
                            ["활동구분", experience.activityType],
                            ["기관 및 조직명", experience.organizationName],
                            [
                              "활동기간",
                              [experience.startDate, experience.endDate]
                                .filter(Boolean)
                                .join(" ~ "),
                            ],
                            ["역할", experience.role],
                          ],
                      experience.description ?? "",
                    );
                    if (!content.trim()) return;
                    onUpdate(sk, mdl, content, "evaluate");
                    return;
                  }
                  if (training) {
                    const content = buildProfileSectionEvaluationContent(
                      "교육이수사항",
                      [
                        ["교육명", training.title],
                        ["교육기관명", training.institution],
                        [
                          "이수기간",
                          [training.startDate, training.endDate]
                            .filter(Boolean)
                            .join(" ~ "),
                        ],
                        [
                          "교육시간",
                          training.hours ? `${training.hours}시간` : "",
                        ],
                      ],
                      training.description ?? "",
                    );
                    if (!content.trim()) return;
                    onUpdate(sk, mdl, content, "evaluate");
                    return;
                  }
                  if (prize) {
                    const content = buildProfileSectionEvaluationContent(
                      "수상",
                      [
                        ["상훈명", prize.title],
                        ["수여기관", prize.organization],
                        ["발급일", prize.issuedDate],
                      ],
                      prize.description ?? "",
                    );
                    if (!content.trim()) return;
                    onUpdate(sk, mdl, content, "evaluate");
                    return;
                  }
                }
                const si = target.selfIntroductions.find((s) => s.id === sk);
                if (!si) return;
                const content = [
                  target.companyName ? `기업명: ${target.companyName}` : "",
                  target.jobTitle ? `직무: ${target.jobTitle}` : "",
                  target.jd ? `채용공고 JD:\n${target.jd}` : "",
                  item.type === "example"
                    ? `문항:\n${si.question}`
                    : si.question
                      ? `문항: ${si.question}`
                      : "",
                  item.type === "example" && si.answer.trim()
                    ? `현재 작성 중인 답변 초안:\n${si.answer}`
                    : item.type !== "example"
                      ? `답변:\n${si.answer}`
                      : "",
                  item.type === "example"
                    ? "요청: 이 문항에 어떤 방향과 소재로 답변하면 좋은지 알려주세요. 완성본 대필보다 작성자가 직접 쓸 수 있는 구조, 소재 후보, 주의점, 짧은 예시 단락을 중심으로 안내해주세요."
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n\n");
                onUpdate(sk, mdl, content, item.type);
              }}
              onDelete={onDelete}
            />
          );
        })}
      </div>
    </div>
  );
}
