import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolbarAction } from "../_types";

function wordCount(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  return { words, chars };
}

export function useEditor() {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [selectedText, setSelectedText] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 컨텍스트 메뉴 닫기
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  const handleTextareaSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setSelectedText(ta.value.substring(ta.selectionStart, ta.selectionEnd));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const applyToolbar = useCallback(
    (action: ToolbarAction) => {
      if (action.title === "sep") return;
      const ta = textareaRef.current;
      if (!ta) return;
      const { selectionStart: start, selectionEnd: end } = ta;
      const { value: newValue, cursor } = action.fn(content, { start, end });
      setContent(newValue);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
      });
    },
    [content],
  );

  const handleExport = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "문서.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const { words, chars } = wordCount(content);

  return {
    content,
    setContent,
    mode,
    setMode,
    selectedText,
    contextMenu,
    textareaRef,
    handleTextareaSelect,
    handleContextMenu,
    applyToolbar,
    handleExport,
    words,
    chars,
  };
}
