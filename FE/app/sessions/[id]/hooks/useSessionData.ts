import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, getModels } from "@/lib/api";
import { Session, ModelDefinition } from "@/types";

const WS_URL = "ws://localhost:3001/ws";

export function useSessionData(id: string) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelDefinition[]>([]);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  // 초기 데이터 로드
  useEffect(() => {
    setLoading(true);
    setSession(null);
    getSession(id)
      .then(setSession)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  // WebSocket으로 실시간 세션 업데이트 수신
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        ws!.send(JSON.stringify({ event: "subscribe", data: { sessionId: id } }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.event === "session:update" && msg.data) {
            setSession(msg.data);
          }
        } catch {
          // 파싱 오류 무시
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [id]);

  return { session, loading, models };
}
