'use client';

export function CommunityBackButton() {
  function goBack() {
    const cameFromThisSite = document.referrer.startsWith(window.location.origin);
    if (cameFromThisSite && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  }

  return (
    <button type="button" onClick={goBack} aria-label="Back to UniVerse-City homepage" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#725331] transition hover:bg-[#eee8dc]">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6M9 12h11"/></svg>
    </button>
  );
}
