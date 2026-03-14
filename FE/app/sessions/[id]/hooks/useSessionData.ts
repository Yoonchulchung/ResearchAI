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

  // RUNNING/PENDING 아이템이 있을 때만 폴링
  const hasActiveResearch = session?.items?.some(
    (t) => t.researchState === "running" || t.researchState === "pending"
  ) ?? false;

  useEffect(() => {
    if (!hasActiveResearch) return;
    const timer = setInterval(() => {
      getSession(id).then(setSession).catch(() => {});
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [id, hasActiveResearch]);

  return { session, loading, models };
}
