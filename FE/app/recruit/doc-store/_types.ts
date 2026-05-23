import type { SavedDocument } from "@/lib/api/documents";
import type { Experience } from "@/lib/api/experiences";

export type ActivePopup =
  | { kind: "doc"; data: SavedDocument; top: number; left: number; width: number }
  | { kind: "exp"; data: Experience; top: number; left: number; width: number }
  | null;
