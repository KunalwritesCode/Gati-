/** Gati mark: a route that bends into a G, starting at a stop. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect width="512" height="512" rx="120" fill="#1769D2" />
      <path d="M335 177 A112 112 0 1 0 368 256 H276" fill="none" stroke="#fff" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="335" cy="177" r="38" fill="#fff" />
      <circle cx="335" cy="177" r="15" fill="#1769D2" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={26} />
      <span className="text-[19px] font-bold tracking-[-0.03em]">Gati</span>
    </span>
  );
}
