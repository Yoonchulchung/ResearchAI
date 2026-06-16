"use client";

interface Props {
  saveTitleInput: string;
  setSaveTitleInput: (v: string) => void;
  saving: boolean;
  onSave: (title: string) => void;
  onClose: () => void;
}

export function SaveModal({ saveTitleInput, setSaveTitleInput, saving, onSave, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-md border border-slate-200 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">문서 저장</h2>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">문서 제목</label>
          <input
            autoFocus
            value={saveTitleInput}
            onChange={(e) => setSaveTitleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && saveTitleInput.trim()) onSave(saveTitleInput.trim());
              if (e.key === "Escape") onClose();
            }}
            placeholder="제목을 입력하세요"
            className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 placeholder-slate-300"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => { if (saveTitleInput.trim()) onSave(saveTitleInput.trim()); }}
            disabled={!saveTitleInput.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {saving && (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
