"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { ModelDefinition } from "@/types";
import { WebSearchEngine } from "@/lib/api/research";
import { AttachedText } from "@/lib/api/sessions";
import { TopicInput, AttachedFile } from "@/components/TopicInput";

export const ChatInputArea = memo(function ChatInputArea({
  onSend,
  onAbort,
  generating,
  cloudAiModels,
  localAiModels,
  webEngines,
  defaultModel,
  defaultWebModel,
}: {
  onSend: (message: string, model: string, attachedTexts: AttachedText[]) => void;
  onAbort: () => void;
  generating: boolean;
  cloudAiModels: ModelDefinition[];
  localAiModels: ModelDefinition[];
  webEngines: WebSearchEngine[];
  defaultModel: string;
  defaultWebModel: string;
}) {
  const [value, setValue] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [selectedWebModel, setSelectedWebModel] = useState(defaultWebModel);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  useEffect(() => { setSelectedModel(defaultModel); }, [defaultModel]);
  useEffect(() => { setSelectedWebModel(defaultWebModel); }, [defaultWebModel]);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg || generating) return;
    const attachedTexts: AttachedText[] = attachedFiles
      .filter((f) => f.parsed?.text)
      .map((f) => ({ filename: f.file.name, text: f.parsed!.text! }));
    setValue("");
    setAttachedFiles([]);
    onSend(msg, selectedModel, attachedTexts);
  }, [value, generating, selectedModel, attachedFiles, onSend]);

  return (
    <TopicInput
      value={value}
      onChange={setValue}
      onGenerate={handleSend}
      onAbort={onAbort}
      generating={generating}
      placeholder="리서치 내용에 대해 질문하세요..."
      generatingLabel="AI가 답변을 생성하고 있습니다..."
      cloudAiModels={cloudAiModels}
      localAiModels={localAiModels}
      webEngines={webEngines}
      selectedCloudAiModel={selectedModel}
      selectedLocalAiModel={selectedModel}
      selectedWebModel={selectedWebModel}
      onCloudAiModelChange={setSelectedModel}
      onLocalAiModelChange={setSelectedModel}
      onWebModelChange={setSelectedWebModel}
      dropdownDirection="up"
      attachedFiles={attachedFiles}
      onAttachedFilesChange={setAttachedFiles}
    />
  );
});
