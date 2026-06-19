import { Suspense } from "react";
import { DisclosurePdfViewer } from "./_components/DisclosurePdfViewer";

export default function DisclosurePdfViewerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">PDF를 준비하고 있습니다.</div>}>
      <DisclosurePdfViewer />
    </Suspense>
  );
}
