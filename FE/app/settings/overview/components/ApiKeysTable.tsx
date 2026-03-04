import { StatusBadge } from "./StatusBadge";
import { type TavilyOverview, type AnthropicUsage } from "./types";

export function ApiKeysTable({
  loading,
  tavily,
  anthropic,
}: {
  loading: boolean;
  tavily: TavilyOverview | null;
  anthropic: AnthropicUsage | null;
}) {
  const apiKey = tavily?.apiKey ?? null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-800">API Keys</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {["Service", "Type", "Key", "Status"].map((h) => (
              <th
                key={h}
                className="text-left px-6 py-3 text-[11px] font-semibold tracking-widest text-slate-400 uppercase first:px-6 [&:not(:first-child)]:px-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="px-6 py-6 text-center text-slate-400 text-sm">
                로딩 중...
              </td>
            </tr>
          ) : (
            <>
              <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-slate-700 font-medium">Tavily</td>
                <td className="px-4 py-4 text-slate-500 text-xs">
                  {apiKey ? (apiKey.includes("dev") ? "dev" : "prod") : "—"}
                </td>
                <td className="px-4 py-4 font-mono text-slate-600 text-xs">
                  {apiKey ?? <span className="text-slate-300">미설정</span>}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge active={!!tavily?.configured} />
                </td>
              </tr>
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-slate-700 font-medium">Anthropic</td>
                <td className="px-4 py-4 text-slate-500 text-xs">admin</td>
                <td className="px-4 py-4 font-mono text-slate-600 text-xs">
                  {anthropic?.configured ? (
                    "sk-ant-admin-••••••••••••"
                  ) : (
                    <span className="text-slate-300">미설정</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge active={!!anthropic?.configured} />
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
