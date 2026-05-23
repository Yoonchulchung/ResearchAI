import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ToolbarAction } from "../_types";

function scrollTextareaToIndex(ta: HTMLTextAreaElement, index: number) {
  const lines = ta.value.substring(0, index).split("\n");
  const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 28;
  ta.scrollTop = Math.max(0, (lines.length - 4) * lineHeight);
}

const DRAFT_KEY = "recruit-draft";

function wordCount(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  return { words, chars };
}

export function useEditor() {
  const searchParams = useSearchParams();
  const isExistingDoc = !!searchParams.get("docId");
  const highlightParam = searchParams.get("highlight");

  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [selectedText, setSelectedText] = useState("");
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [highlightFlash, setHighlightFlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightApplied = useRef(false);

  // mount 후 또는 docId 변경 시 content 초기화
  useEffect(() => {
    if (isExistingDoc) {
      setContent("");
    } else {
      setContent(localStorage.getItem(DRAFT_KEY) ?? "");
    }
   
  }, [isExistingDoc]);

  // highlight 파라미터: 내용이 로드되면 해당 단락으로 스크롤 + 선택 + 애니메이션
  useEffect(() => {
    if (!highlightParam || !content || highlightApplied.current) return;
    const target = decodeURIComponent(highlightParam);
    // 앞 50자로 위치 탐색 (URL 길이 제한 고려)
    const snippet = target.substring(0, 50);
    const idx = content.indexOf(snippet);
    if (idx === -1) return;
    highlightApplied.current = true;
    const ta = textareaRef.current;
    if (!ta) return;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(idx, Math.min(idx + target.length, content.length));
      scrollTextareaToIndex(ta, idx);
      setHighlightFlash(true);
      setTimeout(() => setHighlightFlash(false), 2500);
    });
   
  }, [content, highlightParam]);

  // 새 문서일 때만 draft 자동저장
  useEffect(() => {
    if (isExistingDoc) return;
    if (content) {
      localStorage.setItem(DRAFT_KEY, content);
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [content, isExistingDoc]);

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
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setSelectedText(ta.value.substring(start, end));
    setSelectedRange(start !== end ? { start, end } : null);
  };

  const replaceSelected = (replacement: string) => {
    if (!selectedRange) return;
    const { start, end } = selectedRange;
    setContent((prev) => prev.slice(0, start) + replacement + prev.slice(end));
    setSelectedRange(null);
    setSelectedText("");
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
    selectedRange,
    replaceSelected,
    contextMenu,
    textareaRef,
    highlightFlash,
    handleTextareaSelect,
    handleContextMenu,
    applyToolbar,
    handleExport,
    words,
    chars,
  };
}
