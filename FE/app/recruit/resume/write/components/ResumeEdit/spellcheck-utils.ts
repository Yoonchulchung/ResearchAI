import { uid } from "./resume-utils";

export type SpellcheckChangeStatus = "pending" | "accepted" | "rejected";

interface SpellcheckChange {
  id: string;
  before: string;
  after: string;
  start: number;
  end: number;
  status: SpellcheckChangeStatus;
}

export interface SpellcheckState {
  loading: boolean;
  baseText: string;
  correctedText: string;
  rawResult: string;
  changes: SpellcheckChange[];
  error: string | null;
}

function stripMarkdownFence(text: string) {
  let value = text.trim();
  if (value.startsWith("```")) {
    value = value.replace(/^```[^\n\r]*(?:\r?\n)?/, "");
    value = value.replace(/\r?\n?```\s*$/, "");
  }
  return value.trim();
}

export function extractCorrectedSpellcheckText(
  result: string,
  fallback: string,
) {
  const text = stripMarkdownFence(result);
  let body = text;

  const startMatch = body.match(/#{1,6}\s*📝?\s*교정된 문서/);
  if (startMatch?.index !== undefined)
    body = body.slice(startMatch.index + startMatch[0].length);
  const tableMatch = body.match(/#{1,6}\s*🔍?\s*교정 내역/);
  if (tableMatch?.index !== undefined) body = body.slice(0, tableMatch.index);
  const dividerIndex = body.search(/\n-{3,}\s*(?:\n|$)/);
  if (dividerIndex >= 0) body = body.slice(0, dividerIndex);

  body = body
    .replace(/^\s*```[^\n\r]*(?:\r?\n)?/, "")
    .replace(/\r?\n?```\s*$/, "")
    .trim();
  return body || fallback;
}

function tokenizeForDiff(text: string) {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

export function buildSpellcheckChanges(
  original: string,
  corrected: string,
): SpellcheckChange[] {
  if (original === corrected) return [];

  const a = tokenizeForDiff(original);
  const b = tokenizeForDiff(corrected);
  const offsets = a.reduce<number[]>((acc, token) => {
    const previous =
      acc.length === 0 ? 0 : acc[acc.length - 1] + a[acc.length - 1].length;
    acc.push(previous);
    return acc;
  }, []);
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changes: SpellcheckChange[] = [];
  let i = 0;
  let j = 0;
  let deleted: string[] = [];
  let inserted: string[] = [];
  let hunkStartToken: number | null = null;

  const flush = () => {
    const start =
      hunkStartToken === null
        ? original.length
        : (offsets[hunkStartToken] ?? original.length);
    const end =
      hunkStartToken === null
        ? original.length
        : i < a.length
          ? offsets[i]
          : original.length;
    const before = original.slice(start, end) || deleted.join("");
    const after = inserted.join("");
    if (before !== after && (before.trim() || after.trim())) {
      changes.push({ id: uid(), before, after, start, end, status: "pending" });
    }
    deleted = [];
    inserted = [];
    hunkStartToken = null;
  };

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || dp[i][j + 1] >= dp[i + 1][j])
    ) {
      if (hunkStartToken === null) hunkStartToken = i;
      inserted.push(b[j]);
      j += 1;
    } else if (i < a.length) {
      if (hunkStartToken === null) hunkStartToken = i;
      deleted.push(a[i]);
      i += 1;
    }
  }
  flush();

  return changes;
}

export function applySpellcheckChanges(
  baseText: string,
  changes: SpellcheckChange[],
) {
  let next = "";
  let cursor = 0;
  const ordered = [...changes].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  for (const change of ordered) {
    next += baseText.slice(cursor, change.start);
    next +=
      change.status === "accepted"
        ? change.after
        : baseText.slice(change.start, change.end);
    cursor = change.end;
  }
  return next + baseText.slice(cursor);
}
