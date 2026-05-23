export function FavoriteIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={active ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M8 1.6L9.95 5.55L14.3 6.18L11.15 9.25L11.9 13.58L8 11.53L4.1 13.58L4.85 9.25L1.7 6.18L6.05 5.55L8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
