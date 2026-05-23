import { ResumePageContent } from "../page";

export default async function ResumeWritePage({
  searchParams,
}: {
  searchParams?: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  return <ResumePageContent initialMode="edit" createNewOnLoad={params?.new === "1"} />;
}
