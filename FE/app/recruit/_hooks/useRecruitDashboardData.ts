import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { listCompaniesSlim, type CompanySlimItem } from "@/lib/api/companies";
import { getResume, type ResumeTarget } from "@/lib/api/resume";
import { listCoverLetters, type CoverLetter } from "@/lib/api/recruit/cover-letter";
import { deleteJobRecommendation, getJobRecommendations, type JobRecommendation } from "@/lib/api/recruit/job-posting";
import type { InfoTab } from "../_lib/dashboard";

export function useRecruitDashboardData(activeTab: InfoTab, analysisSearch: string) {
  const [jobs, setJobs] = useState<JobRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resumes, setResumes] = useState<ResumeTarget[]>([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [companyAnalyses, setCompanyAnalyses] = useState<CompanySlimItem[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getJobRecommendations(5);
        if (!cancelled) setJobs(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "채용 정보를 불러오지 못했습니다");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "letters" || coverLetters.length > 0) return;
    let cancelled = false;
    setCoverLoading(true);
    setCoverError(null);
    listCoverLetters(1, 6, { sort: "latest" })
      .then((result) => {
        if (!cancelled) setCoverLetters(result.items);
      })
      .catch((error) => {
        if (!cancelled) {
          setCoverError(error instanceof Error ? error.message : "자소서를 불러오지 못했습니다");
        }
      })
      .finally(() => {
        if (!cancelled) setCoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, coverLetters.length]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const companies = await listCompaniesSlim({ hasAnalysis: true, limit: 10 });
        if (!cancelled) setCompanyAnalyses(companies);
      } catch (e) {
        if (!cancelled) setAnalysisError(e instanceof Error ? e.message : "기업 분석을 불러오지 못했습니다");
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResumeLoading(true);
    getResume()
      .then((profile) => {
        if (!cancelled) {
          const items = [...(profile?.resumeTargets ?? [])].sort(
            (a, b) => (b.appliedAt ?? b.updatedAt ?? "").localeCompare(a.appliedAt ?? a.updatedAt ?? ""),
          );
          setResumes(items);
        }
      })
      .catch(() => {
        if (!cancelled) setResumeError("이력서를 불러오지 못했습니다");
      })
      .finally(() => {
        if (!cancelled) setResumeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCompanyAnalyses = useMemo(() => {
    const query = analysisSearch.trim().toLowerCase();
    if (!query) return companyAnalyses;
    return companyAnalyses.filter((company) =>
      [company.name, company.companyType]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [analysisSearch, companyAnalyses]);

  const visibleCompanyAnalyses = useMemo(() => filteredCompanyAnalyses.slice(0, 10), [filteredCompanyAnalyses]);

  const handleDeleteRecommendation = async (event: MouseEvent, rec: JobRecommendation) => {
    event.preventDefault();
    event.stopPropagation();
    setJobs((prev) => prev.filter((job) => job.id !== rec.id));
    try {
      await deleteJobRecommendation(rec.id);
    } catch {
      setJobs((prev) => [...prev, rec].sort((a, b) => b.score - a.score));
    }
  };

  return {
    jobs,
    loading,
    error,
    resumes,
    resumeLoading,
    resumeError,
    coverLetters,
    coverLoading,
    coverError,
    companyAnalyses,
    analysisLoading,
    analysisError,
    visibleCompanyAnalyses,
    handleDeleteRecommendation,
  };
}
