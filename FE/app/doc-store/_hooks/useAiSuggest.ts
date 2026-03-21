import { useState } from "react";
import { Experience, suggestCategories } from "@/lib/api/experiences";
import { AI_MODELS } from "../_constants";

export function useAiSuggest() {
  const [aiModel, setAiModel] = useState(AI_MODELS[0].id);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string[]>>({});
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
