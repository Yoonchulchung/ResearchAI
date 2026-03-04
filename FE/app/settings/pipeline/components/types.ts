export type NodeStatus = "idle" | "running" | "ok" | "error" | "disabled";

export interface NodeState {
  status: NodeStatus;
  result?: string;
  error?: string;
  ms?: number;
  expanded: boolean;
}

export const STATUS_CONFIG: Record<
  NodeStatus,
  { dot: string; badge: string; label: string; border: string }
> = {
  idle: { dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500", label: "대기", border: "border-slate-200" },
  running: { dot: "bg-blue-400 animate-pulse", badge: "bg-blue-50 text-blue-600", label: "실행 중", border: "border-blue-300" },
  ok: { dot: "bg-green-400", badge: "bg-green-50 text-green-700", label: "완료", border: "border-green-300" },
  error: { dot: "bg-red-400", badge: "bg-red-50 text-red-600", label: "오류", border: "border-red-300" },
  disabled: { dot: "bg-slate-200", badge: "bg-slate-50 text-slate-300", label: "미설정", border: "border-slate-100" },
};
