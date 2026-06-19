"use client";

import { useLayoutEffect, useRef, useState } from "react";

const ACTIVITY_TYPES = [
  "선택안함",
  "동아리활동",
  "연구회",
  "팀 프로젝트",
  "온라인 커뮤니티",
  "재능기부 활동",
  "기타사회활동",
];

const OVERSEAS_PURPOSES = [
  "선택안함",
  "어학연수",
  "해외연수",
  "교환학생",
  "세미나",
  "해외거주",
  "해외봉사",
  "기타",
];

const COUNTRY_CODES = [
  "GH",
  "GA",
  "GY",
  "GM",
  "GG",
  "GP",
  "GT",
  "GU",
  "GD",
  "GR",
  "GL",
  "GN",
  "GW",
  "NA",
  "NR",
  "NG",
  "SS",
  "ZA",
  "NL",
  "NP",
  "NO",
  "NF",
  "NZ",
  "NC",
  "NU",
  "NE",
  "NI",
  "TW",
  "KR",
  "DK",
  "DM",
  "DO",
  "DE",
  "TL",
  "LA",
  "LR",
  "LV",
  "RU",
  "LB",
  "LS",
  "RO",
  "LU",
  "LT",
  "LI",
  "MG",
  "MH",
  "YT",
  "MO",
  "MW",
  "MY",
  "ML",
  "IM",
  "MX",
  "MC",
  "MA",
  "MU",
  "MR",
  "MZ",
  "ME",
  "MS",
  "MD",
  "MV",
  "MT",
  "MN",
  "US",
  "UM",
  "VI",
  "MM",
  "FM",
  "VU",
  "BH",
  "BB",
  "VA",
  "BS",
  "BD",
  "BM",
  "BJ",
  "VE",
  "VN",
  "BE",
  "BY",
  "BZ",
  "BA",
  "BW",
  "BO",
  "BI",
  "BF",
  "BT",
  "MP",
  "MK",
  "BG",
  "BR",
  "BN",
  "WS",
  "SA",
  "GS",
  "SM",
  "ST",
  "PM",
  "EH",
  "SN",
  "RS",
  "SC",
  "LC",
  "VC",
  "KN",
  "SH",
  "SO",
  "SB",
  "SD",
  "SR",
  "LK",
  "SJ",
  "SZ",
  "SE",
  "CH",
  "ES",
  "SK",
  "SI",
  "SY",
  "SL",
  "SG",
  "AE",
  "AW",
  "AM",
  "AR",
  "AS",
  "IS",
  "HT",
  "IE",
  "AZ",
  "AF",
  "AD",
  "AL",
  "DZ",
  "AO",
  "AG",
  "AI",
  "ER",
  "EE",
  "EC",
  "ET",
  "SV",
  "GB",
  "VG",
  "IO",
  "YE",
  "OM",
  "AU",
  "AT",
  "HN",
  "AX",
  "WF",
  "JO",
  "UG",
  "UY",
  "UZ",
  "UA",
  "IQ",
  "IR",
  "IL",
  "EG",
  "IT",
  "IN",
  "ID",
  "JP",
  "JM",
  "ZM",
  "JE",
  "GQ",
  "KP",
  "GE",
  "CN",
  "CF",
  "DJ",
  "GI",
  "ZW",
  "TD",
  "CZ",
  "CL",
  "CM",
  "CV",
  "KZ",
  "QA",
  "KH",
  "CA",
  "KE",
  "KY",
  "KM",
  "CR",
  "CC",
  "CI",
  "CO",
  "CG",
  "CD",
  "CU",
  "KW",
  "CK",
  "CW",
  "HR",
  "CX",
  "KG",
  "KI",
  "CY",
  "TJ",
  "TZ",
  "TH",
  "TC",
  "TR",
  "TG",
  "TK",
  "TO",
  "TM",
  "TV",
  "TN",
  "TT",
  "PA",
  "PY",
  "PK",
  "PG",
  "PW",
  "PS",
  "FO",
  "PE",
  "PT",
  "FK",
  "PL",
  "PR",
  "FR",
  "GF",
  "TF",
  "PF",
  "FJ",
  "FI",
  "PH",
  "PN",
  "HM",
  "HU",
  "HK",
];

const COUNTRY_NAMES = (() => {
  const displayNames = new Intl.DisplayNames(["ko"], { type: "region" });
  return COUNTRY_CODES.map((code) => displayNames.of(code))
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b, "ko"));
})();

export function ActivityInput({
  value,
  onChange,
  placeholder,
  multiline,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows ?? 6}
        className="min-h-36 w-full resize-y rounded-sm border-0 bg-slate-100 px-4 py-4 text-sm leading-relaxed text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600"
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-12 w-full rounded-sm border-0 bg-slate-100 px-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600"
    />
  );
}

export function ActivitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const hasCustomValue = value && !ACTIVITY_TYPES.includes(value);
  return (
    <select
      value={value || "선택안함"}
      onChange={(event) =>
        onChange(event.target.value === "선택안함" ? "" : event.target.value)
      }
      className="h-12 w-full rounded-sm border border-slate-300 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600"
    >
      {hasCustomValue && <option value={value}>{value}</option>}
      {ACTIVITY_TYPES.map((type) => (
        <option key={type} value={type}>
          {type === "선택안함" ? "활동 구분을 선택해주세요." : type}
        </option>
      ))}
    </select>
  );
}

export function OverseasPurposeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value || "선택안함";

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next))
          setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-sm border border-slate-300 bg-slate-50 px-4 text-left text-sm text-slate-800 outline-none transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600"
      >
        <span className={value ? "" : "text-slate-400"}>
          {value || "해외경험 목적을 선택해주세요."}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-slate-700"
        >
          <path
            d="M3.5 5.25L7 8.75L10.5 5.25"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-md border border-slate-300 bg-white py-3 shadow-xl">
          {OVERSEAS_PURPOSES.map((purpose) => (
            <button
              key={purpose}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(purpose === "선택안함" ? "" : purpose);
                setOpen(false);
              }}
              className={`block w-full px-6 py-3 text-left text-sm font-semibold transition-colors hover:bg-slate-50 ${
                selected === purpose ? "text-slate-950" : "text-slate-700"
              }`}
            >
              {purpose}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = [
    "선택안함",
    ...(value && !COUNTRY_NAMES.includes(value) ? [value] : []),
    ...COUNTRY_NAMES,
  ];
  const filtered = query.trim()
    ? options.filter((country) =>
        country.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next))
          setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-sm border border-slate-300 bg-slate-50 px-4 text-left text-sm text-slate-800 outline-none transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600"
      >
        <span className={value ? "" : "text-slate-400"}>
          {value || "해외경험 국가를 선택해주세요."}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-slate-700"
        >
          <path
            d="M3.5 5.25L7 8.75L10.5 5.25"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[26rem] overflow-y-auto rounded-md border border-slate-300 bg-white p-3 shadow-xl">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white pb-3">
            <div className="flex h-11 items-center gap-2 rounded-sm bg-slate-100 px-3">
              <svg
                width="17"
                height="17"
                viewBox="0 0 17 17"
                fill="none"
                className="shrink-0 text-slate-400"
              >
                <circle
                  cx="7.2"
                  cy="7.2"
                  r="4.7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M10.8 10.8L14.2 14.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="국가 검색"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="py-2">
            {filtered.map((country) => (
              <button
                key={country}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(country === "선택안함" ? "" : country);
                  setQuery("");
                  setOpen(false);
                }}
                className={`block w-full px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-slate-50 ${
                  (value || "선택안함") === country
                    ? "text-slate-950"
                    : "text-slate-700"
                }`}
              >
                {country}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm font-semibold text-slate-400">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ActivityDateRange({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input
        type="date"
        value={startDate}
        onChange={(event) => onStartChange(event.target.value)}
        className="h-12 min-w-0 rounded-sm border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-600"
      />
      <span className="text-sm font-bold text-slate-400">~</span>
      <input
        type="date"
        value={endDate}
        onChange={(event) => onEndChange(event.target.value)}
        className="h-12 min-w-0 rounded-sm border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-600"
      />
    </div>
  );
}

export function ActivityDateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full rounded-sm border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-blue-600"
    />
  );
}

export function ActivityTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ActivityInput
      value={value}
      onChange={onChange}
      placeholder="활동 내용을 상세히 입력해주세요."
      rows={6}
      multiline
    />
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
    </div>
  );
}
