import Link from 'next/link';
import type { Metadata } from 'next';
import { CommunityGate } from '@/lib/CommunityGate';

export const metadata: Metadata = {
  title: 'Community | UniVerse-City',
  description: 'Join student conversations, share ideas and talk about campus life on UniVerse-City.',
};

export const dynamic = 'force-dynamic';

export default function CommunityPage() {
  return (
    <main className="min-h-screen bg-[#faf9f6]">
      <header className="sticky top-0 z-40 border-b border-rule bg-[#fffdf9]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-8">
          <Link href="/" aria-label="Back to UniVerse-City homepage" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#725331] transition hover:bg-[#eee8dc]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6M9 12h11"/></svg>
          </Link>
          <div className="min-w-0">
            <p className="font-serif text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">UniVerse-City</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">Community</p>
          </div>
        </div>
      </header>
      <CommunityGate />
    </main>
  );
}
