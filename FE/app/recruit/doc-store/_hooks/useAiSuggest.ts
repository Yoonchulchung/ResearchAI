import { useEffect, useState } from "react";
import { Experience, suggestCategories } from "@/lib/api/experiences";
import { AI_MODELS } from "../_constants";

export function useAiSuggest(experiences: Experience[]) {
  const [aiModel, setAiModel] = useState(AI_MODELS[0].id);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string[]>>({});

  // DB에 저장된 AI 추천 카테고리를 초기값으로 로드
  useEffect(() => {
    const fromDb: Record<string, string[]> = {};
    for (const exp of experiences) {
      if (exp.aiCategories && exp.aiCategories.length > 0) {
        fromDb[exp.id] = exp.aiCategories;
      }
    }
    if (Object.keys(fromDb).length > 0) {
      setAiSuggestions((prev) => ({ ...fromDb, ...prev }));
    }
  }, [experiences]);
  const [suggestingIds, setSuggestingIds] = useState<Set<string>>(new Set());
  const [suggestingAll, setSuggestingAll] = useState(false);

  const handleSuggestOne = async (exp: Experience) => {
    setSuggestingIds((prev) => new Set(prev).add(exp.id));
    try {
      const { categories } = await suggestCategories(exp.id, aiModel);
      setAiSuggestions((prev) => ({ ...prev, [exp.id]: categories }));
    } finally {
      setSuggestingIds((prev) => {
        const s = new Set(prev);
        s.delete(exp.id);
        return s;
      });
    }
  };

  const handleSuggestAll = async (exps: Experience[]) => {
    if (suggestingAll || exps.length === 0) return;
    setSuggestingAll(true);
    try {
      await Promise.all(
        exps.map(async (exp) => {
          const { categories } = await suggestCategories(exp.id, aiModel);
          setAiSuggestions((prev) => ({ ...prev, [exp.id]: categories }));
        }),
      );
    } finally {
      setSuggestingAll(false);
    }
  };

  const clearSuggestions = () => setAiSuggestions({});

  return {
    aiModel,
    setAiModel,
    aiSuggestions,
    suggestingIds,
    suggestingAll,
    handleSuggestOne,
    handleSuggestAll,
    clearSuggestions,
  };
}
