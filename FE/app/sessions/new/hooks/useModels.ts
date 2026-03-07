import { useEffect, useState } from "react";
import { getModels } from "@/lib/api";
import { ModelDefinition } from "@/types";

export function useModels() {
  const [models, setModels] = useState<ModelDefinition[]>([]);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  return {
    models,
    apiModels: models.filter((m) => m.provider !== "ollama"),
    localModels: models.filter((m) => m.provider === "ollama"),
    isLoading: models.length === 0,
  };
}
