"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StockDashboard } from "./_components/StockDashboard";
import { CompanyStockPage } from "./_components/CompanyStockPage";

function StockPageInner() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  if (company) {
    return <CompanyStockPage company={company} />;
  }
  return <StockDashboard />;
}

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockPageInner />
    </Suspense>
  );
}
