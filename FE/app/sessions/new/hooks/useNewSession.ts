import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  lightResearchStream,
  reconnectLightResearch,
  createSession,
  JobItem,
  LightResearchEvent,
} from "@/lib/api";
import { Task, ModelDefinition } from "@/types";

const STORAGE_KEY = "new-session-draft";
const SEARCH_JOB_KEY = "new-session-search-job";

interface DraftState {
  topic: string;
  tasks: Task[];
  searchSource: "web" | "recruit" | "both" | null;
  terminalLogs: string[];
  jobPostings: JobItem[];
  selectedApiModel: string;
  selectedLocalModel: string;
}

export function useNewSession(models: ModelDefinition[]) {
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [selectedApiModel, setSelectedApiModel] = useState("claude-haiku-4-5");
  const [selectedLocalModel, setSelectedLocalModel] = useState("");
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

  // 모델 목록이 로드되면 기본 로컬 모델 설정 (draft 복원값이 없을 때만)
  useEffect(() => {
    if (selectedLocalModel) return;
    const firstLocal = models.find((m) => m.provider === "ollama");
    if (firstLocal) setSelectedLocalModel(firstLocal.id);
  }, [models]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (draft.selectedApiModel) setSelectedApiModel(draft.selectedApiModel);
        if (draft.selectedLocalModel) setSelectedLocalModel(draft.selectedLocalModel);
      }
    } catch {}

    const pendingSearchId = sessionStorage.getItem(SEARCH_JOB_KEY);
    if (pendingSearchId) {
      searchIdRef.current = pendingSearchId;
      setGenerating(true);
      setProgressStep("검색 재연결 중...");
      setTerminalLogs([]);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      reconnectLightResearch(
        pendingSearchId,
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
            sessionStorage.removeItem(SEARCH_JOB_KEY);
            setTasks(event.tasks);
            setSearchSource(event.searchPlan.source);
            setProgressStep(null);
          }
        },
        controller.signal,
      )
        .catch(() => {})
        .finally(() => {
          sessionStorage.removeItem(SEARCH_JOB_KEY);
          abortControllerRef.current = null;
          setGenerating(false);
          setProgressStep(null);
        });
    }

    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft 저장 (복원 완료 후부터)
  useEffect(() => {
    if (!initialized) return;
    try {
      const draft: DraftState = { topic, tasks, searchSource, terminalLogs, jobPostings, selectedApiModel, selectedLocalModel };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
  }, [initialized, topic, tasks, searchSource, terminalLogs, jobPostings, selectedApiModel, selectedLocalModel]);

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
      sessionStorage.removeItem(SEARCH_JOB_KEY);
      setTasks(event.tasks);
      setSearchSource(event.searchPlan.source);
      setProgressStep(null);
      setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    const searchId = crypto.randomUUID();
    searchIdRef.current = searchId;
    sessionStorage.setItem(SEARCH_JOB_KEY, searchId);
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
      await lightResearchStream(topic.trim(), selectedApiModel, searchId, handleSearchEvent, controller.signal);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        sessionStorage.removeItem(SEARCH_JOB_KEY);
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
  };

  const handleResearchStart = async () => {
    if (!topic.trim() || tasks.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const session = await createSession(topic.trim(), selectedApiModel, selectedLocalModel, tasks);
      router.push(`/sessions/${session.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "세션 생성 실패");
      setCreating(false);
    }
  };

  const updateTask = (idx: number, field: keyof Task, value: string) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const removeTask = (idx: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const addTask = () => {
    const newId = tasks.length > 0 ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;
    setTasks((prev) => [...prev, { id: newId, title: "", icon: "📌", prompt: "" }]);
  };

  return {
    topic, setTopic,
    selectedApiModel, setSelectedApiModel,
    selectedLocalModel, setSelectedLocalModel,
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
  };
}
