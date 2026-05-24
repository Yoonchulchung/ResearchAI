import { ResumePageContent } from "../page";
import { Suspense } from "react";

export default async function ResumeWritePage({
  searchParams,
}: {
  searchParams?: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>}>
      <ResumePageContent initialMode="edit" createNewOnLoad={params?.new === "1"} />
    </Suspense>
  );
}
