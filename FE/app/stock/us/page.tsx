import { redirect } from "next/navigation";

export default function UsStockPage() {
  redirect("/stock?market=US");
}
