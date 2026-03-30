"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  getGmailStatus,
  getGmailAuthUrl,
  getGmailMessages,
  disconnectGmail,
  GmailMessage,
  GmailStatus,
} from "@/lib/api";

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isToday) {
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function EmailCard() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await getGmailStatus();
      setStatus(s);
      if (s.connected) {
        const msgs = await getGmailMessages(10);
        setMessages(msgs);
      }
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // OAuth 콜백 후 ?gmail=connected 파라미터 감지
  useEffect(() => {
    if (searchParams.get("gmail") === "connected") {
      loadStatus();
    }
  }, [searchParams, loadStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await getGmailAuthUrl();
      window.location.href = url;
    } catch {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectGmail();
    setStatus({ connected: false });
    setMessages([]);
  };

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" fill="#EA4335" opacity=".2"/>
            <path d="M20 4H4L12 13l8-9z" fill="#EA4335"/>
            <path d="M2 6l10 7 10-7" stroke="#EA4335" strokeWidth="1.5" fill="none"/>
          </svg>
          <h2 className="text-m font-bold text-slate-700">Gmail</h2>
        </div>
        {status?.connected && (
          <button
            onClick={handleDisconnect}
            className="text-2xs text-slate-400 hover:text-red-400 transition-colors"
          >
            연동 해제
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20 text-slate-400 text-sm">
          불러오는 중...
        </div>
      ) : !status?.connected ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <p className="text-xs text-slate-500 text-center">
            Gmail을 연동하면 최근 메일을<br />여기서 바로 확인할 수 있습니다
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {connecting ? "연결 중..." : "Google로 연동"}
          </button>
        </div>
      ) : (
        <div>
          {status.email && (
            <p className="text-2xs text-slate-400 mb-3 truncate">{status.email}</p>
          )}
          {messages.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">메일이 없습니다</p>
          ) : (
            <ul className="space-y-0.5">
              {messages.map((msg) => (
                <li key={msg.id}>
                  <div className="flex items-start gap-2 px-1 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    {msg.isUnread && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <div className={`flex-1 min-w-0 ${!msg.isUnread ? "pl-3.5" : ""}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs truncate ${msg.isUnread ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                          {msg.from}
                        </span>
                        <span className="text-2xs text-slate-400 flex-shrink-0">
                          {formatDate(msg.date)}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${msg.isUnread ? "font-medium text-slate-700" : "text-slate-500"}`}>
                        {msg.subject}
                      </p>
                      <p className="text-2xs text-slate-400 truncate mt-0.5 leading-relaxed">
                        {msg.snippet}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
