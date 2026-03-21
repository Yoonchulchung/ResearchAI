import { useState } from "react";
import { ExperienceSearchResult, searchExperiences } from "@/lib/api/experiences";

export function useRag() {
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<ExperienceSearchResult[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [selectedExperiences, setSelectedExperiences] = useState<ExperienceSearchResult[]>([]);
  const [ragExpanded, setRagExpanded] = useState(false);

  const handleRagSearch = async () => {
    if (!ragQuery.trim() || ragLoading) return;
    setRagLoading(true);
    setRagResults([]);
    try {
      const results = await searchExperiences(ragQuery.trim(), 5);
      setRagResults(results);
      setRagExpanded(true);
    } finally {
      setRagLoading(false);
    }
  };

  const toggleExperience = (exp: ExperienceSearchResult) => {
    setSelectedExperiences((prev) =>
      prev.some((e) => e.id === exp.id) ? prev.filter((e) => e.id !== exp.id) : [...prev, exp],
    );
  };

  return {
    ragQuery,
    setRagQuery,
    ragResults,
    ragLoading,
    selectedExperiences,
    ragExpanded,
    setRagExpanded,
    handleRagSearch,
    toggleExperience,
  };
}
