'use client';

export function VerificationBadge({ className = 'inline-block h-4 w-4' }: { className?: string }) {
  return <svg aria-label="Verified account" role="img" viewBox="0 0 20 20" className={className}>
    <path fill="#2388e8" d="M10 0.8 12.4 2l2.7-.1 1.2 2.4 2.3 1.4-.5 2.7.8 2.6-1.9 1.9-.6 2.7-2.7.5-2.1 1.7-2.4-1.2-2.7.1-1.2-2.4-2.3-1.4.5-2.7-.8-2.6 1.9-1.9.6-2.7 2.7-.5z"/>
    <path d="m6.1 10.1 2.5 2.5 5.3-5.3" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
