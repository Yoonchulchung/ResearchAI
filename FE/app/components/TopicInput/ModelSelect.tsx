"use client";

import { ModelDefinition } from "@/types";

export function ModelSelect({
  models,
  selectedModel,
  onChange,
  placeholder,
}: {
  models: ModelDefinition[];
  selectedModel: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  if (models.length === 0) return null;
  const isSelected = models.some((m) => m.id === selectedModel);
  return (
    <select
      value={isSelected ? selectedModel : ""}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs text-slate-500 !bg-transparent focus:outline-none cursor-pointer max-w-28 truncate"
    >
      {!isSelected && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
