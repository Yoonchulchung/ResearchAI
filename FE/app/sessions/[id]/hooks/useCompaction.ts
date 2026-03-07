import { useEffect, useState } from "react";
import { triggerCompaction, getCompactionStatus } from "@/lib/api";
import { Session, TaskStatus } from "@/types";

export function useCompaction(
  session: Session | null,
  statuses: Record<string, TaskStatus>,
  isRunning: boolean,
  id: string,
) {
  const [compactionStatus, setCompactionStatus] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (!session) return;
    const total = session.items?.length ?? 0;
    const done = Object.values(statuses).filter((s) => s === "done").length;
    if (done !== total || total === 0 || isRunning) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    getCompactionStatus(id)
      .then((s) => {
        if (s.status === "done") {
          setCompactionStatus("done");
          return;
        }
        setCompactionStatus("running");
        triggerCompaction(id).catch(() => {});
        interval = setInterval(() => {
          getCompactionStatus(id)
            .then((res) => {
              setCompactionStatus(res.status);
              if (res.status === "done" && interval) {
                clearInterval(interval);
                interval = null;
              }
            })
            .catch(() => {
              if (interval) clearInterval(interval);
              interval = null;
            });
        }, 2000);
      })
      .catch(() => {});

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session, statuses, isRunning, id]);

  return { compactionStatus };
}
