import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  enqueueLightResearch,
  subscribeLightResearch,
  cancelLightResearch,
  getQueueStatus,
  createSession,
  setAttachedFileIds,
  getSearchEngines,
  classifyIntent,
  JobItem,
  LightResearchEvent,
  WebSearchEngine,
} from "@/lib/api";
import { AttachedFilePayload } from "@/lib/api/research";
import { generateSessionTitle } from "@/lib/api/ai";
import { Task, ModelDefinition, MediaType } from "@/types";
import { AttachedFile } from "@/components/TopicInput";

const STORAGE_KEY = "new-session-draft";

/** 시스템 기본 AI (Gemini 무료 + Groq 폴백). 로컬 모델 대안으로 사용 가능 */
export const DEFAULT_FREE_MODEL_ID = "__default_free__";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  intent?: "chat" | "research" | "clarify";
}

interface DraftState {
  topic: string;
  tasks: Task[];
  searchSource: "web" | "recruit" | "both" | null;
  terminalLogs: string[];
  jobPostings: JobItem[];
  selectedCloudAiModel: string;
  selectedLocalAiModel: string;
  conversation: ConversationMessage[];
}

export function useNewSession(models: ModelDefinition[]) {
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [selectedCloudAiModel, setSelectedCloudAiModel] = useState("claude-haiku-4-5");
  const [selectedLocalAiModel, setSelectedLocalAiModel] = useState("");
  const [selectedWebModel, setSelectedWebModel] = useState("anthropic-builtin");
  const [webEngines, setWebEngines] = useState<WebSearchEngine[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchSource, setSearchSource] = useState<"web" | "recruit" | "both" | null>(null);
  const [jobPostings, setJobPostings] = useState<JobItem[]>([]);
  const [jobsExpanded, setJobsExpanded] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [classifyingIntent, setClassifyingIntent] = useState(false);

  const taskListRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef<string | null>(null);
  const topicRef = useRef(topic);
  const cloudAiModelRef = useRef(selectedCloudAiModel);
  useEffect(() => { topicRef.current = topic; }, [topic]);
  useEffect(() => { cloudAiModelRef.current = selectedCloudAiModel; }, [selectedCloudAiModel]);

  // 요약·생성 AI 초기값: 로컬 → 클라우드 → 기본 무료 순으로 설정
  useEffect(() => {
    if (selectedLocalAiModel) return;
    const firstLocal = models.find((m) => m.provider === "ollama" || m.provider === "llama-cpp");
    const firstCloud = models.find((m) => m.provider !== "ollama" && m.provider !== "llama-cpp");
    setSelectedLocalAiModel(firstLocal?.id ?? firstCloud?.id ?? DEFAULT_FREE_MODEL_ID);
  }, [models]); // eslint-disable-line react-hooks/exhaustive-deps

  // 검색 엔진 목록 로드
  useEffect(() => {
    getSearchEngines().then(setWebEngines).catch(() => {});
  }, []);

  // Draft 복원 + 진행 중인 검색 재연결
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft: DraftState = JSON.parse(raw);
        if (draft.topic) setTopic(draft.topic);
        if (draft.tasks?.length) setTasks(draft.tasks);
        if (draft.searchSource) setSearchSource(draft.searchSource);
        if (draft.terminalLogs?.length) setTerminalLogs(draft.terminalLogs);
        if (draft.jobPostings?.length) setJobPostings(draft.jobPostings);
        if (draft.selectedCloudAiModel) setSelectedCloudAiModel(draft.selectedCloudAiModel);
        if (draft.selectedLocalAiModel) setSelectedLocalAiModel(draft.selectedLocalAiModel);
        if (draft.conversation?.length) {
          // 과거 에러 메시지는 복원 시 제거 (AI 히스토리 오염 방지)
          const cleaned = draft.conversation.filter(
            (m) => !(m.role === "assistant" && m.content.startsWith("오류")),
          );
          setConversation(cleaned);
        }
      }
    } catch {}

    getQueueStatus().then((status) => {
      const lightJob = status.jobs.find(
        (j) => j.taskType === "lightresearch" && (j.status === "pending" || j.status === "running"),
      );
      if (!lightJob) return;

      const searchId = lightJob.sessionId;
      searchIdRef.current = searchId;
      setGenerating(true);
      setProgressStep("검색 재연결 중...");
      setTerminalLogs([]);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      subscribeLightResearch(
        searchId,
        (event) => {
          if (event.type === "plan") {
            const label = event.source === "web" ? "웹" : event.source === "recruit" ? "채용 공고" : "웹 + 채용 공고";
            setProgressStep(`${label} 검색 중...`);
          } else if (event.type === "generating") {
            setProgressStep("AI 태스크 생성 중...");
          } else if (event.type === "log") {
            const ts = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            setTerminalLogs((prev) => [...prev, `[${ts}] ${event.message}`]);
          } else if (event.type === "jobs") {
            setJobPostings(event.jobs);
          } else if (event.type === "done") {
            setTasks(event.tasks);
            setSearchSource(event.searchPlan.source);
            setProgressStep(null);
            setGeneratingTitle(true);
            generateSessionTitle(topicRef.current, event.tasks, cloudAiModelRef.current)
              .then(({ title }) => setSessionTitle(title))
              .catch(() => {})
              .finally(() => setGeneratingTitle(false));
          }
        },
        controller.signal,
      )
        .catch(() => {})
        .finally(() => {
          abortControllerRef.current = null;
          setGenerating(false);
          setProgressStep(null);
        });
    }).catch(() => {});

    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft 저장 (복원 완료 후부터)
  useEffect(() => {
    if (!initialized) return;
    try {
      const draft: DraftState = { topic, tasks, searchSource, terminalLogs, jobPostings, selectedCloudAiModel, selectedLocalAiModel, conversation };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
  }, [initialized, topic, tasks, searchSource, terminalLogs, jobPostings, selectedCloudAiModel, selectedLocalAiModel, conversation]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const pushLog = (line: string) => {
    const ts = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminalLogs((prev) => [...prev, `[${ts}] ${line}`]);
  };

  const handleSearchEvent = (event: LightResearchEvent) => {
    if (event.type === "plan") {
      const label = event.source === "web" ? "웹" : event.source === "recruit" ? "채용 공고" : "웹 + 채용 공고";
      setProgressStep(`${label} 검색 중...`);
    } else if (event.type === "generating") {
      setProgressStep("AI 태스크 생성 중...");
    } else if (event.type === "log") {
      pushLog(event.message);
    } else if (event.type === "jobs") {
      setJobPostings(event.jobs);
    } else if (event.type === "done") {
      setTasks(event.tasks);
      setSearchSource(event.searchPlan.source);
      setProgressStep(null);
      setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      // AI로 세션 제목 자동 생성
      setGeneratingTitle(true);
      generateSessionTitle(topic, event.tasks, selectedCloudAiModel)
        .then(({ title }) => setSessionTitle(title))
        .catch(() => setSessionTitle(topic.slice(0, 20)))
        .finally(() => setGeneratingTitle(false));
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Light Research 파이프라인 실행 (의도 분류 없이 바로) */
  const runLightResearch = async (researchTopic: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setProgressStep("시작 중...");
    setTerminalLogs([]);
    setTasks([]);
    setSearchSource(null);
    setJobPostings([]);
    setError("");
    try {
      const filePayloads: AttachedFilePayload[] = attachedFiles
        .filter((f) => f.parsed && !f.uploading && !f.error)
        .map((f) => ({
          type: f.parsed!.type,
          mediaType: f.parsed!.type === MediaType.IMAGE ? f.mimetype : undefined,
          dataUrl: f.parsed!.type === MediaType.IMAGE ? f.parsed!.dataUrl : undefined,
          text: f.parsed!.text,
        }));
      // "기본 무료 AI" 선택 시 BE에 빈 문자열 전달
      const localModelForApi =
        selectedLocalAiModel === DEFAULT_FREE_MODEL_ID ? "" : selectedLocalAiModel;
      const { searchId } = await enqueueLightResearch({
        topic: researchTopic,
        cloudAIModel: selectedCloudAiModel,
        localAIModel: localModelForApi,
        webModel: selectedWebModel,
        attachedFiles: filePayloads.length > 0 ? filePayloads : undefined,
      });
      searchIdRef.current = searchId;
      setAttachedFiles([]);
      await subscribeLightResearch(searchId, handleSearchEvent, controller.signal);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setProgressStep(null);
        pushLog("검색이 중단되었습니다.");
      } else {
        const msg = e instanceof Error ? e.message : "태스크 생성 실패";
        setError(msg);
        setProgressStep(null);
        pushLog(`오류: ${msg}`);
      }
    } finally {
      abortControllerRef.current = null;
      setGenerating(false);
    }
  };

  /** 기본 엔트리포인트 — 먼저 AI로 의도 분류, 결과에 따라 분기 */
  const handleGenerate = async () => {
    const userInput = topic.trim();
    if (!userInput || generating || classifyingIntent) return;

    setError("");
    // 사용자 메시지를 대화에 추가
    const userMessage: ConversationMessage = { role: "user", content: userInput };
    const newConversation = [...conversation, userMessage];
    setConversation(newConversation);
    setTopic("");
    setClassifyingIntent(true);

    try {
      // 현재 메시지는 topic으로 별도 전달하므로 히스토리에서 제외
      // 또한 과거 에러 메시지는 AI를 혼란시키므로 제외
      const historyForAi = conversation
        .filter((m) => !(m.role === "assistant" && m.content.startsWith("⚠️")))
        .map(({ role, content }) => ({ role, content }));
      // "기본 무료 AI" 선택 시 BE에 빈 값 전달 → DEFAULT_AI_MODEL(Gemini) 사용
      const modelForClassifier =
        selectedLocalAiModel && selectedLocalAiModel !== DEFAULT_FREE_MODEL_ID
          ? selectedLocalAiModel
          : undefined;
      const result = await classifyIntent(userInput, historyForAi, modelForClassifier);

      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: result.message || "(응답 없음)",
        intent: result.intent,
      };
      setConversation([...newConversation, assistantMessage]);

      if (result.intent === "research") {
        const researchTopic = result.refinedTopic?.trim() || userInput;
        setTopic(researchTopic);
        setClassifyingIntent(false);
        await runLightResearch(researchTopic);
        return;
      }
      // chat / clarify → 대화 계속
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "의도 분류 실패";
      // 에러는 대화 히스토리 대신 error 상태로 표시 (AI 히스토리 오염 방지)
      setError(`의도 분류 오류: ${msg}`);
    } finally {
      setClassifyingIntent(false);
    }
  };

  /** 사용자가 "그냥 리서치 진행"을 강제로 누른 경우 */
  const handleForceResearch = async () => {
    // 가장 최근 사용자 메시지를 주제로 사용
    const lastUserMsg = [...conversation].reverse().find((m) => m.role === "user");
    const researchTopic = lastUserMsg?.content.trim() || topic.trim();
    if (!researchTopic) return;
    setTopic(researchTopic);
    await runLightResearch(researchTopic);
  };

  /** 대화 초기화 */
  const resetConversation = () => {
    setConversation([]);
    setTopic("");
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    if (searchIdRef.current) {
      cancelLightResearch(searchIdRef.current).catch(() => {});
    }
  };

  const handleResearchStart = async () => {
    if (!topic.trim() || tasks.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const title = sessionTitle.trim() || topic.trim();
      const session = await createSession(title, selectedCloudAiModel, selectedLocalAiModel, selectedWebModel, tasks);
      const fileIds = attachedFiles
        .filter((f) => f.parsed?.fileId)
        .map((f) => f.parsed!.fileId!);
      if (fileIds.length > 0) {
        await setAttachedFileIds(session.id, fileIds).catch(() => {});
      }
      router.push(`/sessions/${session.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "세션 생성 실패");
      setCreating(false);
    }
  };

  const updateTask = (taskId: number, field: keyof Task, value: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)));
  };

  const removeTask = (idx: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const addTask = () => {
    const newId = tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;
    setTasks((prev) => [...prev, { id: newId, itemId: "", title: "", icon: "📌", webSearchPrompt: "" }]);
  };

  const replaceTasks = (newTasks: Task[]) => {
    setTasks(newTasks.map((t) => ({ ...t, itemId: t.itemId ?? "" })));
  };

  return {
    topic, setTopic,
    attachedFiles, setAttachedFiles,
    sessionTitle, setSessionTitle,
    generatingTitle,
    selectedCloudAiModel, setSelectedCloudAiModel,
    selectedLocalAiModel, setSelectedLocalAiModel,
    selectedWebModel, setSelectedWebModel,
    webEngines,
    tasks,
    searchSource,
    jobPostings,
    jobsExpanded, setJobsExpanded,
    generating,
    progressStep,
    terminalLogs,
    creating,
    error,
    taskListRef,
    handleGenerate,
    handleCancel,
    handleResearchStart,
    handleForceResearch,
    resetConversation,
    conversation,
    classifyingIntent,
    updateTask,
    removeTask,
    addTask,
    replaceTasks,
  };
}
