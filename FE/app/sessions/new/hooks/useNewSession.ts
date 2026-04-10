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
  JobItem,
  LightResearchEvent,
  WebSearchEngine,
} from "@/lib/api";
import { AttachedFilePayload } from "@/lib/api/research";
import { generateSessionTitle } from "@/lib/api/ai";
import { Task, ModelDefinition, MediaType } from "@/types";
import { AttachedFile } from "@/components/TopicInput";

const STORAGE_KEY = "new-session-draft";

interface DraftState {
  topic: string;
  tasks: Task[];
  searchSource: "web" | "recruit" | "both" | null;
  terminalLogs: string[];
  jobPostings: JobItem[];
  selectedCloudAiModel: string;
  selectedLocalAiModel: string;
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

  const taskListRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef<string | null>(null);
  const topicRef = useRef(topic);
  const cloudAiModelRef = useRef(selectedCloudAiModel);
  useEffect(() => { topicRef.current = topic; }, [topic]);
  useEffect(() => { cloudAiModelRef.current = selectedCloudAiModel; }, [selectedCloudAiModel]);

  // 모델 목록이 로드되면 기본 로컬 모델 설정 (draft 복원값이 없을 때만)
  useEffect(() => {
    if (selectedLocalAiModel) return;
    const firstLocal = models.find((m) => m.provider === "ollama");
    if (firstLocal) setSelectedLocalAiModel(firstLocal.id);
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
      const draft: DraftState = { topic, tasks, searchSource, terminalLogs, jobPostings, selectedCloudAiModel, selectedLocalAiModel };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
  }, [initialized, topic, tasks, searchSource, terminalLogs, jobPostings, selectedCloudAiModel, selectedLocalAiModel]);

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

  const handleGenerate = async () => {
    if (!topic.trim()) return;
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
      const { searchId } = await enqueueLightResearch({
        topic: topic.trim(),
        cloudAIModel: selectedCloudAiModel,
        localAIModel: selectedLocalAiModel,
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
    updateTask,
    removeTask,
    addTask,
    replaceTasks,
  };
}
