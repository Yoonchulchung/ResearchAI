"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listCompanyAnalyses,
  getCompanyAnalysis,
  deleteCompanyAnalysis,
  type CompanyAnalysis,
} from "@/lib/api/company-analysis";

export function useCompanyList() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyAnalysis[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<CompanyAnalysis | null>(null);

  const refreshList = async () => {
    setLoadingList(true);
    try {
      setCompanies(await listCompanyAnalyses());
    } catch {
      setCompanies([]);
    } finally {
      setLoadingList(false);
    }
  };

  const handleSelect = async (companyKey: string) => {
    try {
      const detail = await getCompanyAnalysis(companyKey);
      setSelected(detail);
      router.replace(`/company-analysis?company=${encodeURIComponent(detail.companyName)}`, { scroll: false });
    } catch { }
  };

  const handleDelete = async (companyKey: string) => {
    if (!confirm("해당 기업 분석 데이터를 삭제하시겠습니까?")) return;
    await deleteCompanyAnalysis(companyKey);
    if (selected?.companyKey === companyKey) setSelected(null);
    refreshList();
  };

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => c.companyName.toLowerCase().includes(q));
  }, [companies, searchQuery]);

  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return null;
    return companies.find(
      (c) => c.companyName.toLowerCase().replace(/\s+/g, "") === q || c.companyKey === q,
    ) ?? null;
  }, [companies, searchQuery]);

  return {
    companies,
    loadingList,
    searchQuery,
    setSearchQuery,
    selected,
    setSelected,
    refreshList,
    handleSelect,
    handleDelete,
    filteredCompanies,
    exactMatch,
  };
}
