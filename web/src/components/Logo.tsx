/** Three family arcs around a haldi-yellow dose. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="DoseCircle">
      <rect width="64" height="64" rx="14" fill="var(--color-ink)" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="var(--color-paper)" strokeWidth="6" strokeLinecap="round" strokeDasharray="26.2 11.5" transform="rotate(-78 32 32)" />
      <circle cx="32" cy="32" r="7" fill="var(--color-haldi)" />
    </svg>
  );
}
