'use client';

export function VerificationBadge({
  className = 'inline-block h-4 w-4 align-[-0.18em] shrink-0',
}: {
  className?: string;
}) {
  return (
    <svg
      aria-label="Verified account"
      role="img"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      focusable="false"
    >
      <circle cx="12" cy="12" r="10.5" fill="#8A5A32" />
      <circle cx="12" cy="12" r="9.35" stroke="#D9B27C" strokeWidth="0.8" />
      <path
        d="M7.25 12.15L10.35 15.2L16.85 8.85"
        stroke="#FFFDF8"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
