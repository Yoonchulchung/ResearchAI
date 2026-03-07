import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, getModels } from "@/lib/api";
import { Session, ModelDefinition } from "@/types";

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

  return { session, loading, models };
}
