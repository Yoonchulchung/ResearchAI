"use client";

import type {
  ResumeExperience,
  ResumePrize,
  ResumeSelfIntro,
  ResumeTarget,
  ResumeTraining,
} from "@/lib/api/resume";
import { IconEvaluate } from "../../../../_components/icons";
import { MODELS } from "../../../../_constants";
import {
  ActivityDateInput,
  ActivityDateRange,
  ActivityInput,
  ActivitySelect,
  ActivityTextarea,
  BlockField,
  CountrySelect,
  DateField,
  DeleteBtn,
  EmptyHint,
  Field,
  IconBtn,
  InlineField,
  InlineSpellcheckPanel,
  OverseasPurposeSelect,
  PortfolioSection,
  SectionTitle,
  SpellcheckButton,
  TextEvaluateButton,
} from "./support";
import type { ResumeEditAssist } from "./useResumeEditAssist";

export interface ResumeEditSectionsProps {
  targets: ResumeTarget[];
  activeTarget: ResumeTarget;
  hideTargetSelector: boolean;
  setActiveTargetId: (id: string) => void;
  addTarget: () => void;
  updateActiveTarget: (patch: Partial<ResumeTarget>) => void;
  activeExperiences: ResumeExperience[];
  activePrizes: ResumePrize[];
  activeTrainings: ResumeTraining[];
  updateExperienceAt: (index: number, patch: Partial<ResumeExperience>) => void;
  removeExperienceAt: (index: number) => void;
  addExperience: (activityType?: string) => void;
  moveNormalExperienceAt: (index: number, direction: -1 | 1) => void;
  moveOverseasExperienceAt: (index: number, direction: -1 | 1) => void;
  firstNormalExperienceIndex: number;
  lastNormalExperienceIndex: number;
  firstOverseasExperienceIndex: number;
  lastOverseasExperienceIndex: number;
  updatePrizeAt: (index: number, patch: Partial<ResumePrize>) => void;
  removePrizeAt: (index: number) => void;
  addPrize: () => void;
  movePrizeAt: (index: number, direction: -1 | 1) => void;
  updateTrainingAt: (index: number, patch: Partial<ResumeTraining>) => void;
  removeTrainingAt: (index: number) => void;
  addTraining: () => void;
  moveTrainingAt: (index: number, direction: -1 | 1) => void;
  addSelfIntro: () => void;
  buildProfileSectionEvaluationContent: (
    sectionLabel: string,
    fields: Array<[string, string | null | undefined]>,
    description: string,
  ) => string;
  assist: ResumeEditAssist;
  onEvaluate?: (selfIntro: ResumeSelfIntro, index: number) => void;
  onEvaluateText?: (subjectKey: string, title: string, content: string) => void;
  onGuide?: (selfIntro: ResumeSelfIntro, index: number) => void;
}

export function ResumeEditSections(props: ResumeEditSectionsProps) {
  const {
    targets,
    activeTarget,
    hideTargetSelector,
    setActiveTargetId,
    addTarget,
    updateActiveTarget,
    activeExperiences,
    activePrizes,
    activeTrainings,
    updateExperienceAt,
    removeExperienceAt,
    addExperience,
    moveNormalExperienceAt,
    moveOverseasExperienceAt,
    firstNormalExperienceIndex,
    lastNormalExperienceIndex,
    firstOverseasExperienceIndex,
    lastOverseasExperienceIndex,
    updatePrizeAt,
    removePrizeAt,
    addPrize,
    movePrizeAt,
    updateTrainingAt,
    removeTrainingAt,
    addTraining,
    moveTrainingAt,
    addSelfIntro,
    buildProfileSectionEvaluationContent,
    assist,
    onEvaluate,
    onEvaluateText,
    onGuide,
  } = props;
  const {
    spellchecks,
    runSpellcheck,
    updateSpellcheckChange,
    applyAllSpellcheckChanges,
    closeSpellcheck,
    jdDragOver,
    setJdDragOver,
    jdImageLoading,
    jdImageError,
    jdOcrModel,
    setJdOcrModel,
    handleJdImageFiles,
    handleJdPaste,
  } = assist;

  return (
    <div className="flex flex-col gap-0">
      {/* 기업별 지원 이력서 */}
      <section className="pb-6">
        <div className="flex items-center justify-between mb-4">
          {!hideTargetSelector && (
            <button
              onClick={addTarget}
              className="text-xs font-bold text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path
                  d="M5.5 1v9M1 5.5h9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              기업 추가
            </button>
          )}
        </div>

        {!hideTargetSelector && (
          <div className="mb-5 flex gap-0 overflow-x-auto border-b border-slate-100">
            {targets.map((target, index) => (
              <button
                key={target.id}
                onClick={() => setActiveTargetId(target.id)}
                className={`shrink-0 border-b-2 -mb-px px-3 pb-3 pt-1 text-left transition-colors ${
                  activeTarget.id === target.id
                    ? "border-slate-800 text-slate-900"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <span className="block text-2xs font-black tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="block max-w-36 truncate text-xs font-bold">
                  {target.companyName || "새 기업"}
                </span>
                {target.jobTitle && (
                  <span className="block max-w-36 truncate text-2xs text-slate-400">
                    {target.jobTitle}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="pt-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-6">
            <Field
              label="기업명"
              value={activeTarget.companyName}
              onChange={(v) => updateActiveTarget({ companyName: v })}
              placeholder="삼성전자 / 카카오"
            />
            <Field
              label="직무"
              value={activeTarget.jobTitle}
              onChange={(v) => updateActiveTarget({ jobTitle: v })}
              placeholder="SW 개발 / 데이터 분석"
            />
            <DateField
              label="지원일자"
              value={activeTarget.appliedAt ?? ""}
              onChange={(v) => updateActiveTarget({ appliedAt: v })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="sm:col-span-1">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setJdDragOver(true);
                }}
                onDragLeave={() => setJdDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  handleJdImageFiles(event.dataTransfer.files);
                }}
                className={`rounded-md border p-3 transition-colors ${
                  jdDragOver
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    JD (채용공고)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <SpellcheckButton
                      onClick={() =>
                        runSpellcheck(`${activeTarget.id}-jd`, activeTarget.jd)
                      }
                      disabled={
                        !activeTarget.jd.trim() ||
                        spellchecks[`${activeTarget.id}-jd`]?.loading
                      }
                    />
                    <select
                      value={jdOcrModel}
                      onChange={(e) => setJdOcrModel(e.target.value)}
                      className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none focus:border-indigo-500"
                      title="OCR 모델"
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700">
                      {jdImageLoading ? (
                        <span className="h-3 w-3 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                      ) : (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 13 13"
                          fill="none"
                        >
                          <path
                            d="M2 10.5L4.8 7.7C5.15 7.35 5.72 7.35 6.07 7.7L7 8.63L8.93 6.7C9.28 6.35 9.85 6.35 10.2 6.7L11 7.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <rect
                            x="1.5"
                            y="2"
                            width="10"
                            height="9"
                            rx="1.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                          <circle
                            cx="4.4"
                            cy="4.8"
                            r="0.8"
                            fill="currentColor"
                          />
                        </svg>
                      )}
                      이미지에서 추출
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          if (event.target.files)
                            handleJdImageFiles(event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
                <Field
                  label=""
                  value={activeTarget.jd}
                  onChange={(value) => updateActiveTarget({ jd: value })}
                  placeholder="지원할 채용공고 내용을 붙여넣거나, 채용공고 이미지를 이 영역에 끌어다 놓으세요."
                  rows={7}
                  multiline
                  onPaste={handleJdPaste}
                />
                <InlineSpellcheckPanel
                  state={spellchecks[`${activeTarget.id}-jd`]}
                  onAccept={(changeId) =>
                    updateSpellcheckChange(
                      `${activeTarget.id}-jd`,
                      changeId,
                      "accepted",
                      (value) => updateActiveTarget({ jd: value }),
                    )
                  }
                  onReject={(changeId) =>
                    updateSpellcheckChange(
                      `${activeTarget.id}-jd`,
                      changeId,
                      "rejected",
                      (value) => updateActiveTarget({ jd: value }),
                    )
                  }
                  onApplyAll={() =>
                    applyAllSpellcheckChanges(
                      `${activeTarget.id}-jd`,
                      (value) => updateActiveTarget({ jd: value }),
                    )
                  }
                  onClose={() => closeSpellcheck(`${activeTarget.id}-jd`)}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">
                    이미지 파일을 끌어다 놓으면 JD 텍스트로 추출해서 아래 내용에
                    추가합니다.
                  </p>
                  {jdImageError && (
                    <p className="text-xs font-semibold text-red-500">
                      {jdImageError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 교육 이수사항 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>교육 이수사항</SectionTitle>
        {activeTrainings.length === 0 && (
          <EmptyHint>
            교육 과정, 부트캠프, 직무 교육 등 이수사항을 추가해주세요.
          </EmptyHint>
        )}
        <div className="flex flex-col gap-6">
          {activeTrainings.map((training, index) => (
            <div
              key={training.id}
              className="border border-transparent bg-white py-2"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-base font-black text-slate-800">
                  - 교육이수사항
                </span>
                <div className="flex items-center gap-4">
                  <TextEvaluateButton
                    onClick={() =>
                      onEvaluateText?.(
                        training.id,
                        `교육이수사항 ${index + 1} 글 평가`,
                        buildProfileSectionEvaluationContent(
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
                        ),
                      )
                    }
                    disabled={!(training.description ?? "").trim()}
                  />
                  <SpellcheckButton
                    onClick={() =>
                      runSpellcheck(training.id, training.description ?? "")
                    }
                    disabled={
                      !(training.description ?? "").trim() ||
                      spellchecks[training.id]?.loading
                    }
                  />
                  <IconBtn
                    label="위로 이동"
                    onClick={() => moveTrainingAt(index, -1)}
                    disabled={index === 0}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 15V3M4.5 7.5L9 3l4.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </IconBtn>
                  <IconBtn
                    label="아래로 이동"
                    onClick={() => moveTrainingAt(index, 1)}
                    disabled={index === activeTrainings.length - 1}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 3v12M4.5 10.5L9 15l4.5-4.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </IconBtn>
                  <IconBtn label="삭제" onClick={() => removeTrainingAt(index)}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M4 9h10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconBtn>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                <InlineField label="교육명">
                  <ActivityInput
                    value={training.title}
                    onChange={(v) => updateTrainingAt(index, { title: v })}
                    placeholder="교육 과정명을 입력해주세요."
                  />
                </InlineField>
                <InlineField label="교육기관명">
                  <ActivityInput
                    value={training.institution}
                    onChange={(v) =>
                      updateTrainingAt(index, { institution: v })
                    }
                    placeholder="교육 기관명을 입력해주세요."
                  />
                </InlineField>
                <InlineField label="이수기간">
                  <ActivityDateRange
                    startDate={training.startDate ?? ""}
                    endDate={training.endDate ?? ""}
                    onStartChange={(v) =>
                      updateTrainingAt(index, { startDate: v })
                    }
                    onEndChange={(v) => updateTrainingAt(index, { endDate: v })}
                  />
                </InlineField>
                <InlineField label="교육시간">
                  <div className="relative">
                    <ActivityInput
                      value={training.hours ?? ""}
                      onChange={(v) => updateTrainingAt(index, { hours: v })}
                      placeholder="교육시간"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      시간
                    </span>
                  </div>
                </InlineField>
                <BlockField label="교육과정">
                  <ActivityInput
                    value={training.description ?? ""}
                    onChange={(v) =>
                      updateTrainingAt(index, { description: v })
                    }
                    placeholder="교육 과정 주요 내용을 상세히 입력해주세요."
                    rows={6}
                    multiline
                  />
                  <InlineSpellcheckPanel
                    state={spellchecks[training.id]}
                    onAccept={(changeId) =>
                      updateSpellcheckChange(
                        training.id,
                        changeId,
                        "accepted",
                        (value) =>
                          updateTrainingAt(index, { description: value }),
                      )
                    }
                    onReject={(changeId) =>
                      updateSpellcheckChange(
                        training.id,
                        changeId,
                        "rejected",
                        (value) =>
                          updateTrainingAt(index, { description: value }),
                      )
                    }
                    onApplyAll={() =>
                      applyAllSpellcheckChanges(training.id, (value) =>
                        updateTrainingAt(index, { description: value }),
                      )
                    }
                    onClose={() => closeSpellcheck(training.id)}
                  />
                </BlockField>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addTraining}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2v10M2 7h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            교육이수사항
          </button>
        </div>
      </section>

      {/* 학내외 활동 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>학내외 활동</SectionTitle>
        {activeExperiences.filter((exp) => exp.activityType !== "해외 경험")
          .length === 0 && (
          <EmptyHint>
            동아리, 연구회, 팀 프로젝트, 온라인 커뮤니티 등 학내외 활동을
            추가해주세요.
          </EmptyHint>
        )}
        <div className="flex flex-col gap-6">
          {activeExperiences.map((exp, index) => {
            if (exp.activityType === "해외 경험") return null;
            return (
              <div
                key={exp.id}
                className="border border-transparent bg-white py-2"
              >
                <div className="mb-6 flex items-center justify-between gap-3">
                  <span className="text-base font-black text-slate-800">
                    - 학내외활동
                  </span>
                  <div className="flex items-center gap-4">
                    <TextEvaluateButton
                      onClick={() =>
                        onEvaluateText?.(
                          exp.id,
                          `학내외활동 ${index + 1} 글 평가`,
                          buildProfileSectionEvaluationContent(
                            "학내외활동",
                            [
                              ["활동구분", exp.activityType],
                              ["기관 및 조직명", exp.organizationName],
                              [
                                "활동기간",
                                [exp.startDate, exp.endDate]
                                  .filter(Boolean)
                                  .join(" ~ "),
                              ],
                              ["역할", exp.role],
                            ],
                            exp.description ?? "",
                          ),
                        )
                      }
                      disabled={!(exp.description ?? "").trim()}
                    />
                    <SpellcheckButton
                      onClick={() =>
                        runSpellcheck(exp.id, exp.description ?? "")
                      }
                      disabled={
                        !(exp.description ?? "").trim() ||
                        spellchecks[exp.id]?.loading
                      }
                    />
                    <IconBtn
                      label="위로 이동"
                      onClick={() => moveNormalExperienceAt(index, -1)}
                      disabled={index === firstNormalExperienceIndex}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <path
                          d="M9 15V3M4.5 7.5L9 3l4.5 4.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </IconBtn>
                    <IconBtn
                      label="아래로 이동"
                      onClick={() => moveNormalExperienceAt(index, 1)}
                      disabled={index === lastNormalExperienceIndex}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <path
                          d="M9 3v12M4.5 10.5L9 15l4.5-4.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </IconBtn>
                    <IconBtn
                      label="삭제"
                      onClick={() => removeExperienceAt(index)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <path
                          d="M4 9h10"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </IconBtn>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                  <InlineField label="활동구분">
                    <ActivitySelect
                      value={exp.activityType}
                      onChange={(v) =>
                        updateExperienceAt(index, { activityType: v })
                      }
                    />
                  </InlineField>
                  <InlineField label="기관 및 조직명">
                    <ActivityInput
                      value={exp.organizationName}
                      onChange={(v) =>
                        updateExperienceAt(index, { organizationName: v })
                      }
                      placeholder="기관 및 조직명을 입력해주세요."
                    />
                  </InlineField>
                  <InlineField label="활동기간">
                    <ActivityDateRange
                      startDate={exp.startDate ?? ""}
                      endDate={exp.endDate ?? ""}
                      onStartChange={(v) =>
                        updateExperienceAt(index, { startDate: v })
                      }
                      onEndChange={(v) =>
                        updateExperienceAt(index, { endDate: v })
                      }
                    />
                  </InlineField>
                  <InlineField label="역할">
                    <ActivityInput
                      value={exp.role ?? ""}
                      onChange={(v) => updateExperienceAt(index, { role: v })}
                      placeholder="직위 또는 역할을 입력해주세요."
                    />
                  </InlineField>
                  <BlockField label="상세 내용">
                    <div className="flex flex-col gap-2">
                      <ActivityTextarea
                        value={exp.description ?? ""}
                        onChange={(v) =>
                          updateExperienceAt(index, { description: v })
                        }
                      />
                      <InlineSpellcheckPanel
                        state={spellchecks[exp.id]}
                        onAccept={(changeId) =>
                          updateSpellcheckChange(
                            exp.id,
                            changeId,
                            "accepted",
                            (value) =>
                              updateExperienceAt(index, { description: value }),
                          )
                        }
                        onReject={(changeId) =>
                          updateSpellcheckChange(
                            exp.id,
                            changeId,
                            "rejected",
                            (value) =>
                              updateExperienceAt(index, { description: value }),
                          )
                        }
                        onApplyAll={() =>
                          applyAllSpellcheckChanges(exp.id, (value) =>
                            updateExperienceAt(index, { description: value }),
                          )
                        }
                        onClose={() => closeSpellcheck(exp.id)}
                      />
                      <span className="self-end text-xs font-semibold text-slate-400">
                        공백 포함{" "}
                        {(exp.description ?? "").length.toLocaleString()}자 ·
                        공백 제외{" "}
                        {(exp.description ?? "")
                          .replace(/\s/g, "")
                          .length.toLocaleString()}
                        자
                      </span>
                    </div>
                  </BlockField>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addExperience()}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2v10M2 7h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            학내외활동
          </button>
        </div>
      </section>

      {/* 수상 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>수상</SectionTitle>
        {activePrizes.length === 0 && (
          <EmptyHint>
            공모전, 대회, 장학, 표창 등 수상 내역을 추가해주세요.
          </EmptyHint>
        )}
        <div className="flex flex-col gap-6">
          {activePrizes.map((prize, index) => (
            <div
              key={prize.id}
              className="border border-transparent bg-white py-2"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-base font-black text-slate-800">
                  - 수상
                </span>
                <div className="flex items-center gap-4">
                  <TextEvaluateButton
                    onClick={() =>
                      onEvaluateText?.(
                        prize.id,
                        `수상 ${index + 1} 글 평가`,
                        buildProfileSectionEvaluationContent(
                          "수상",
                          [
                            ["상훈명", prize.title],
                            ["수여기관", prize.organization],
                            ["발급일", prize.issuedDate],
                          ],
                          prize.description ?? "",
                        ),
                      )
                    }
                    disabled={!(prize.description ?? "").trim()}
                  />
                  <SpellcheckButton
                    onClick={() =>
                      runSpellcheck(prize.id, prize.description ?? "")
                    }
                    disabled={
                      !(prize.description ?? "").trim() ||
                      spellchecks[prize.id]?.loading
                    }
                  />
                  <IconBtn
                    label="위로 이동"
                    onClick={() => movePrizeAt(index, -1)}
                    disabled={index === 0}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 15V3M4.5 7.5L9 3l4.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </IconBtn>
                  <IconBtn
                    label="아래로 이동"
                    onClick={() => movePrizeAt(index, 1)}
                    disabled={index === activePrizes.length - 1}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 3v12M4.5 10.5L9 15l4.5-4.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </IconBtn>
                  <IconBtn label="삭제" onClick={() => removePrizeAt(index)}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M4 9h10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconBtn>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                <InlineField label="상훈명">
                  <ActivityInput
                    value={prize.title}
                    onChange={(v) => updatePrizeAt(index, { title: v })}
                    placeholder="공모전 대상 / 우수상"
                  />
                </InlineField>
                <InlineField label="수여기관">
                  <ActivityInput
                    value={prize.organization}
                    onChange={(v) => updatePrizeAt(index, { organization: v })}
                    placeholder="수여기관을 입력해주세요."
                  />
                </InlineField>
                <InlineField label="발급일">
                  <ActivityDateInput
                    value={prize.issuedDate ?? ""}
                    onChange={(v) => updatePrizeAt(index, { issuedDate: v })}
                  />
                </InlineField>
                <BlockField label="상세 내용">
                  <div className="flex flex-col gap-2">
                    <ActivityInput
                      value={prize.description ?? ""}
                      onChange={(v) => updatePrizeAt(index, { description: v })}
                      placeholder="수상 배경, 기여도, 결과를 적어주세요."
                      rows={4}
                      multiline
                    />
                    <InlineSpellcheckPanel
                      state={spellchecks[prize.id]}
                      onAccept={(changeId) =>
                        updateSpellcheckChange(
                          prize.id,
                          changeId,
                          "accepted",
                          (value) =>
                            updatePrizeAt(index, { description: value }),
                        )
                      }
                      onReject={(changeId) =>
                        updateSpellcheckChange(
                          prize.id,
                          changeId,
                          "rejected",
                          (value) =>
                            updatePrizeAt(index, { description: value }),
                        )
                      }
                      onApplyAll={() =>
                        applyAllSpellcheckChanges(prize.id, (value) =>
                          updatePrizeAt(index, { description: value }),
                        )
                      }
                      onClose={() => closeSpellcheck(prize.id)}
                    />
                    <span className="self-end text-xs font-semibold text-slate-400">
                      공백 포함{" "}
                      {(prize.description ?? "").length.toLocaleString()}자 ·
                      공백 제외{" "}
                      {(prize.description ?? "")
                        .replace(/\s/g, "")
                        .length.toLocaleString()}
                      자
                    </span>
                  </div>
                </BlockField>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addPrize}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2v10M2 7h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            수상
          </button>
        </div>
      </section>

      {/* 해외 활동 */}
      <section className="border-t border-slate-200 pt-6 pb-6">
        <SectionTitle>해외 활동</SectionTitle>
        {activeExperiences.filter((exp) => exp.activityType === "해외 경험")
          .length === 0 && (
          <EmptyHint>
            해외연수, 교환학생, 글로벌 프로젝트 등 해외 활동을 추가해주세요.
          </EmptyHint>
        )}
        <div className="flex flex-col gap-6">
          {activeExperiences.map((exp, index) => {
            if (exp.activityType !== "해외 경험") return null;
            return (
              <div
                key={exp.id}
                className="border border-transparent bg-white py-2"
              >
                <div className="mb-6 flex items-center justify-between gap-3">
                  <span className="text-base font-black text-slate-800">
                    - 해외 활동
                  </span>
                  <div className="flex items-center gap-4">
                    <TextEvaluateButton
                      onClick={() =>
                        onEvaluateText?.(
                          exp.id,
                          `해외 활동 ${index + 1} 글 평가`,
                          buildProfileSectionEvaluationContent(
                            "해외 활동",
                            [
                              ["해외경험 목적", exp.role],
                              ["국가", exp.organizationName],
                              [
                                "해외경험 기간",
                                [exp.startDate, exp.endDate]
                                  .filter(Boolean)
                                  .join(" ~ "),
                              ],
                            ],
                            exp.description ?? "",
                          ),
                        )
                      }
                      disabled={!(exp.description ?? "").trim()}
                    />
                    <SpellcheckButton
                      onClick={() =>
                        runSpellcheck(exp.id, exp.description ?? "")
                      }
                      disabled={
                        !(exp.description ?? "").trim() ||
                        spellchecks[exp.id]?.loading
                      }
                    />
                    <IconBtn
                      label="위로 이동"
                      onClick={() => moveOverseasExperienceAt(index, -1)}
                      disabled={index === firstOverseasExperienceIndex}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <path
                          d="M9 15V3M4.5 7.5L9 3l4.5 4.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </IconBtn>
                    <IconBtn
                      label="아래로 이동"
                      onClick={() => moveOverseasExperienceAt(index, 1)}
                      disabled={index === lastOverseasExperienceIndex}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <path
                          d="M9 3v12M4.5 10.5L9 15l4.5-4.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </IconBtn>
                    <IconBtn
                      label="삭제"
                      onClick={() => removeExperienceAt(index)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <path
                          d="M4 9h10"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </IconBtn>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-12 gap-y-5 xl:grid-cols-2">
                  <InlineField label="해외경험 목적">
                    <OverseasPurposeSelect
                      value={exp.role ?? ""}
                      onChange={(v) => updateExperienceAt(index, { role: v })}
                    />
                  </InlineField>
                  <InlineField label="국가선택">
                    <CountrySelect
                      value={exp.organizationName}
                      onChange={(v) =>
                        updateExperienceAt(index, { organizationName: v })
                      }
                    />
                  </InlineField>
                  <InlineField label="해외경험 기간">
                    <ActivityDateRange
                      startDate={exp.startDate ?? ""}
                      endDate={exp.endDate ?? ""}
                      onStartChange={(v) =>
                        updateExperienceAt(index, { startDate: v })
                      }
                      onEndChange={(v) =>
                        updateExperienceAt(index, { endDate: v })
                      }
                    />
                  </InlineField>
                  <BlockField label="상세 내용">
                    <ActivityInput
                      value={exp.description ?? ""}
                      onChange={(v) =>
                        updateExperienceAt(index, { description: v })
                      }
                      placeholder="국가, 수행 내용, 배운 점, 성과를 적어주세요."
                      rows={4}
                      multiline
                    />
                    <InlineSpellcheckPanel
                      state={spellchecks[exp.id]}
                      onAccept={(changeId) =>
                        updateSpellcheckChange(
                          exp.id,
                          changeId,
                          "accepted",
                          (value) =>
                            updateExperienceAt(index, { description: value }),
                        )
                      }
                      onReject={(changeId) =>
                        updateSpellcheckChange(
                          exp.id,
                          changeId,
                          "rejected",
                          (value) =>
                            updateExperienceAt(index, { description: value }),
                        )
                      }
                      onApplyAll={() =>
                        applyAllSpellcheckChanges(exp.id, (value) =>
                          updateExperienceAt(index, { description: value }),
                        )
                      }
                      onClose={() => closeSpellcheck(exp.id)}
                    />
                  </BlockField>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addExperience("해외 경험")}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2v10M2 7h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            해외 활동
          </button>
        </div>
      </section>

      {/* 자기소개서 */}
      <section className="border-t border-slate-200 pt-6 pb-2">
        <SectionTitle>자기소개서</SectionTitle>
        {activeTarget.selfIntroductions.length === 0 && (
          <EmptyHint>현재 기업의 자기소개서 문항을 추가해주세요.</EmptyHint>
        )}
        <div className="flex flex-col gap-6">
          {activeTarget.selfIntroductions.map((si, i) => (
            <div
              key={si.id}
              className="bg-slate-50/80 border border-slate-200 rounded-md p-5 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">
                    문항 {i + 1}
                  </span>
                  {si.category && si.category.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {si.category.map((category) => (
                        <span
                          key={category}
                          className="inline-flex items-center rounded-sm bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onGuide?.(si, i)}
                    disabled={!si.question.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className="shrink-0"
                    >
                      <path
                        d="M6 1.2l.9 2.8 2.9.1-2.3 1.7.8 2.9L6 7 3.7 8.7l.8-2.9-2.3-1.7 2.9-.1L6 1.2z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    작성 방향
                  </button>
                  <DeleteBtn
                    onClick={() =>
                      updateActiveTarget({
                        selfIntroductions:
                          activeTarget.selfIntroductions.filter(
                            (_, j) => j !== i,
                          ),
                      })
                    }
                  />
                </div>
              </div>
              <Field
                label="질문"
                value={si.question}
                onChange={(v) => {
                  const ss = [...activeTarget.selfIntroductions];
                  ss[i] = { ...ss[i], question: v };
                  updateActiveTarget({ selfIntroductions: ss });
                }}
                placeholder="성장과정 및 인생에서 가장 가치를 두는 것은?"
                multiline
                rows={1}
              />
              <Field
                label="답변 (학내외 활동 라이브러리에 저장됩니다)"
                value={si.answer}
                onChange={(v) => {
                  const ss = [...activeTarget.selfIntroductions];
                  ss[i] = { ...ss[i], answer: v };
                  updateActiveTarget({ selfIntroductions: ss });
                }}
                placeholder="자세한 내용을 작성하세요."
                multiline
                rows={8}
              />
              <InlineSpellcheckPanel
                state={spellchecks[si.id]}
                onAccept={(changeId) =>
                  updateSpellcheckChange(
                    si.id,
                    changeId,
                    "accepted",
                    (value) => {
                      const ss = [...activeTarget.selfIntroductions];
                      ss[i] = { ...ss[i], answer: value };
                      updateActiveTarget({ selfIntroductions: ss });
                    },
                  )
                }
                onReject={(changeId) =>
                  updateSpellcheckChange(
                    si.id,
                    changeId,
                    "rejected",
                    (value) => {
                      const ss = [...activeTarget.selfIntroductions];
                      ss[i] = { ...ss[i], answer: value };
                      updateActiveTarget({ selfIntroductions: ss });
                    },
                  )
                }
                onApplyAll={() =>
                  applyAllSpellcheckChanges(si.id, (value) => {
                    const ss = [...activeTarget.selfIntroductions];
                    ss[i] = { ...ss[i], answer: value };
                    updateActiveTarget({ selfIntroductions: ss });
                  })
                }
                onClose={() => closeSpellcheck(si.id)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-400">
                  공백 포함 {si.answer.length.toLocaleString()}자 · 공백 제외{" "}
                  {si.answer.replace(/\s/g, "").length.toLocaleString()}자
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runSpellcheck(si.id, si.answer)}
                    disabled={!si.answer.trim() || spellchecks[si.id]?.loading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    맞춤법
                  </button>
                  <button
                    onClick={() => onEvaluate?.(si, i)}
                    disabled={!si.answer.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-4 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <IconEvaluate />글 평가
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addSelfIntro}
            className="flex h-14 w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-white text-sm font-black text-slate-700 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2v10M2 7h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            자기소개서
          </button>
        </div>
      </section>

      <PortfolioSection resumeId={activeTarget.id} />
    </div>
  );
}
