"use client";

import {
  type ResumeExperience,
  type ResumePrize,
  type ResumeProfile,
  type ResumeSelfIntro,
  type ResumeTarget,
  type ResumeTraining,
} from "@/lib/api/resume";
import {
  createResumeExperience,
  createResumePrize,
  createResumeTarget,
  createResumeTraining,
  uid,
} from "./support";
import { ResumeEditSections } from "./ResumeEditSections";
import { useResumeEditAssist } from "./useResumeEditAssist";

export default function ResumeEdit({
  profile,
  update,
  activeTargetId,
  setActiveTargetId,
  hideTargetSelector = false,
  model,
  onEvaluate,
  onEvaluateText,
  onGuide,
}: {
  profile: ResumeProfile;
  update: (patch: Partial<ResumeProfile>) => void;
  activeTargetId: string | null;
  setActiveTargetId: (id: string) => void;
  hideTargetSelector?: boolean;
  model?: string;
  onEvaluate?: (si: ResumeSelfIntro, index: number) => void;
  onEvaluateText?: (subjectKey: string, title: string, content: string) => void;
  onGuide?: (si: ResumeSelfIntro, index: number) => void;
}) {
  const targets =
    profile.resumeTargets && profile.resumeTargets.length > 0
      ? profile.resumeTargets
      : [createResumeTarget()];
  const activeTarget =
    targets.find((target) => target.id === activeTargetId) ?? targets[0];

  const updateTargets = (nextTargets: ResumeTarget[]) =>
    update({ resumeTargets: nextTargets });
  const updateActiveTarget = (patch: Partial<ResumeTarget>) => {
    updateTargets(
      targets.map((target) =>
        target.id === activeTarget.id ? { ...target, ...patch } : target,
      ),
    );
  };
  const assist = useResumeEditAssist({
    activeTarget,
    updateActiveTarget,
    model,
  });
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
  const addTarget = () => {
    const target = createResumeTarget();
    updateTargets([...targets, target]);
    setActiveTargetId(target.id);
  };
  const activeExperiences = activeTarget.experiences ?? [];
  const activePrizes = activeTarget.prizes ?? [];
  const activeTrainings = activeTarget.trainings ?? [];
  const updateExperienceAt = (
    index: number,
    patch: Partial<ResumeExperience>,
  ) => {
    const experiences = [...activeExperiences];
    experiences[index] = { ...experiences[index], ...patch };
    updateActiveTarget({ experiences });
  };
  const removeExperienceAt = (index: number) => {
    updateActiveTarget({
      experiences: activeExperiences.filter((_, i) => i !== index),
    });
  };
  const addExperience = (activityType = "") => {
    updateActiveTarget({
      experiences: [...activeExperiences, createResumeExperience(activityType)],
    });
  };
  const updatePrizeAt = (index: number, patch: Partial<ResumePrize>) => {
    const prizes = [...activePrizes];
    prizes[index] = { ...prizes[index], ...patch };
    updateActiveTarget({ prizes });
  };
  const removePrizeAt = (index: number) => {
    updateActiveTarget({ prizes: activePrizes.filter((_, i) => i !== index) });
  };
  const addPrize = () => {
    updateActiveTarget({ prizes: [...activePrizes, createResumePrize()] });
  };
  const movePrizeAt = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activePrizes.length) return;
    const prizes = [...activePrizes];
    [prizes[index], prizes[targetIndex]] = [prizes[targetIndex], prizes[index]];
    updateActiveTarget({ prizes });
  };
  const updateTrainingAt = (index: number, patch: Partial<ResumeTraining>) => {
    const trainings = [...activeTrainings];
    trainings[index] = { ...trainings[index], ...patch };
    updateActiveTarget({ trainings });
  };
  const removeTrainingAt = (index: number) => {
    updateActiveTarget({
      trainings: activeTrainings.filter((_, i) => i !== index),
    });
  };
  const addTraining = () => {
    updateActiveTarget({
      trainings: [...activeTrainings, createResumeTraining()],
    });
  };
  const moveTrainingAt = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeTrainings.length) return;
    const trainings = [...activeTrainings];
    [trainings[index], trainings[targetIndex]] = [
      trainings[targetIndex],
      trainings[index],
    ];
    updateActiveTarget({ trainings });
  };
  const addSelfIntro = () => {
    updateActiveTarget({
      selfIntroductions: [
        ...activeTarget.selfIntroductions,
        { id: uid(), question: "", answer: "" },
      ],
    });
  };

  const normalExperienceIndexes = activeExperiences
    .map((exp, index) => (exp.activityType === "해외 경험" ? -1 : index))
    .filter((index) => index >= 0);
  const firstNormalExperienceIndex = normalExperienceIndexes[0] ?? -1;
  const lastNormalExperienceIndex =
    normalExperienceIndexes[normalExperienceIndexes.length - 1] ?? -1;
  const overseasExperienceIndexes = activeExperiences
    .map((exp, index) => (exp.activityType === "해외 경험" ? index : -1))
    .filter((index) => index >= 0);
  const firstOverseasExperienceIndex = overseasExperienceIndexes[0] ?? -1;
  const lastOverseasExperienceIndex =
    overseasExperienceIndexes[overseasExperienceIndexes.length - 1] ?? -1;
  const moveNormalExperienceAt = (index: number, direction: -1 | 1) => {
    const currentPosition = normalExperienceIndexes.indexOf(index);
    const targetIndex = normalExperienceIndexes[currentPosition + direction];
    if (targetIndex === undefined) return;
    const experiences = [...activeExperiences];
    [experiences[index], experiences[targetIndex]] = [
      experiences[targetIndex],
      experiences[index],
    ];
    updateActiveTarget({ experiences });
  };
  const moveOverseasExperienceAt = (index: number, direction: -1 | 1) => {
    const currentPosition = overseasExperienceIndexes.indexOf(index);
    const targetIndex = overseasExperienceIndexes[currentPosition + direction];
    if (targetIndex === undefined) return;
    const experiences = [...activeExperiences];
    [experiences[index], experiences[targetIndex]] = [
      experiences[targetIndex],
      experiences[index],
    ];
    updateActiveTarget({ experiences });
  };
  const buildProfileSectionEvaluationContent = (
    sectionLabel: string,
    fields: Array<[string, string | null | undefined]>,
    description: string,
  ) => {
    const isOverseas = sectionLabel === "해외 활동";
    const base = [
      !isOverseas && activeTarget.companyName
        ? `기업명: ${activeTarget.companyName}`
        : "",
      !isOverseas && activeTarget.jobTitle
        ? `직무: ${activeTarget.jobTitle}`
        : "",
      !isOverseas && activeTarget.jd ? `채용공고 JD:\n${activeTarget.jd}` : "",
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

  return (
    <ResumeEditSections
      targets={targets}
      activeTarget={activeTarget}
      hideTargetSelector={hideTargetSelector}
      setActiveTargetId={setActiveTargetId}
      addTarget={addTarget}
      updateActiveTarget={updateActiveTarget}
      activeExperiences={activeExperiences}
      activePrizes={activePrizes}
      activeTrainings={activeTrainings}
      updateExperienceAt={updateExperienceAt}
      removeExperienceAt={removeExperienceAt}
      addExperience={addExperience}
      moveNormalExperienceAt={moveNormalExperienceAt}
      moveOverseasExperienceAt={moveOverseasExperienceAt}
      firstNormalExperienceIndex={firstNormalExperienceIndex}
      lastNormalExperienceIndex={lastNormalExperienceIndex}
      firstOverseasExperienceIndex={firstOverseasExperienceIndex}
      lastOverseasExperienceIndex={lastOverseasExperienceIndex}
      updatePrizeAt={updatePrizeAt}
      removePrizeAt={removePrizeAt}
      addPrize={addPrize}
      movePrizeAt={movePrizeAt}
      updateTrainingAt={updateTrainingAt}
      removeTrainingAt={removeTrainingAt}
      addTraining={addTraining}
      moveTrainingAt={moveTrainingAt}
      addSelfIntro={addSelfIntro}
      buildProfileSectionEvaluationContent={
        buildProfileSectionEvaluationContent
      }
      assist={assist}
      onEvaluate={onEvaluate}
      onEvaluateText={onEvaluateText}
      onGuide={onGuide}
    />
  );
}
