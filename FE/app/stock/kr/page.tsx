import { redirect } from "next/navigation";

export default function KoreanStockPage() {
  redirect("/stock?market=KR");
}
