import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, getModels } from "@/lib/api";
import { Session, ModelDefinition } from "@/types";

const POLL_INTERVAL = 3000;

export function useSessionData(id: string) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelDefinition[]>([]);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setSession(null);
    getSession(id)
      .then(setSession)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  // 완료되지 않은 task가 있을 때만 폴링
  const hasPendingTasks = session?.items?.some((t) => !t.result) ?? false;

  useEffect(() => {
    if (!hasPendingTasks) return;
    const timer = setInterval(() => {
      getSession(id).then(setSession).catch(() => {});
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [id, hasPendingTasks]);

  return { session, loading, models };
}
