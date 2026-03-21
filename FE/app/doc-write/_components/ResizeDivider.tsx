interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
}

export function ResizeDivider({ onMouseDown, isDragging }: Props) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`w-1.5 shrink-0 flex items-center justify-center cursor-col-resize group relative hover:bg-indigo-100 transition-colors ${
        isDragging ? "bg-indigo-200" : "bg-slate-200/60"
      }`}
    >
      <div
        className={`w-0.5 h-10 rounded-full transition-colors ${
          isDragging ? "bg-indigo-400" : "bg-slate-300 group-hover:bg-indigo-300"
        }`}
      />
    </div>
  );
}
