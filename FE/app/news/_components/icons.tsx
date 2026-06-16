export function IconFeed() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="4.5" cy="13.5" r="1.4" fill="currentColor" />
      <path d="M3.5 8.5C6.8 8.5 9.5 11.2 9.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 4C9.3 4 14 8.7 14 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconPaper() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M5 2.5H10.5L14 6V15C14 15.55 13.55 16 13 16H5C4.45 16 4 15.55 4 15V3.5C4 2.95 4.45 2.5 5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10.5 2.5V6H14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 9H11.5M6.5 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconBookmark({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path d="M5 3.25h8v11.5L9 12.3l-4 2.45V3.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSparkles() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8.5 1.8L9.7 5.1L13 6.3L9.7 7.5L8.5 10.8L7.3 7.5L4 6.3L7.3 5.1L8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.2 9.4L3.8 11L5.4 11.6L3.8 12.2L3.2 13.8L2.6 12.2L1 11.6L2.6 11L3.2 9.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export function IconNewspaper() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7H13M5 10H10M5 13H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrophy() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M9 13v2.5M6 15.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 3.5H5v5a4 4 0 0 0 8 0V3.5h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5.5H3.5a1 1 0 0 0-1 1V8a2 2 0 0 0 2 2H5M13 5.5h1.5a1 1 0 0 1 1 1V8a2 2 0 0 1-2 2H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="7.5" cy="7.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconEconomy() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M3 13L6.5 9L9.5 11.5L14 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 5h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconScience() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M7 2v5.5L4 13.5a1 1 0 0 0 .87 1.5h8.26a1 1 0 0 0 .87-1.5L11 7.5V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 2h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7.5" cy="11.5" r="0.7" fill="currentColor" />
      <circle cx="10.5" cy="12.5" r="0.7" fill="currentColor" />
    </svg>
  );
}

export function IconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 2.5C9 2.5 6.5 5.5 6.5 9s2.5 6.5 2.5 6.5M9 2.5c0 0 2.5 3 2.5 6.5S9 15.5 9 15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2.5 9h13M3.5 6h11M3.5 12h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function IconCode() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M6 5L2 9l4 4M12 5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 3.5l-2 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconHugging() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 15c0-2.76 2.69-5 6-5s6 2.24 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.5 6.5C7 6 7.5 5.5 9 5.5s2 .5 2.5 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
