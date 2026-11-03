import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';
import { Masthead } from '@/lib/Masthead';
import { CommunityGate } from '@/lib/CommunityGate';
import CopyrightNotice from '@/components/CopyrightNotice';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Join student conversations, share ideas and talk about campus life on UniVerse-City.',
};

export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const settings = await getSettings();

  return (
    <main>
      <Masthead settings={settings} currentPage="community" />
      <div className="border-b border-rule bg-[#faf9f6]">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">UniVerse-City Community</p>
          <h1 className="mt-2 max-w-3xl font-serif text-3xl leading-tight tracking-[-0.035em] text-ink sm:text-5xl">
            Your place to talk about student life.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            From campus happenings to everyday questions, this is where student conversations live.
          </p>
        </div>
      </div>
      <CommunityGate />
      <CopyrightNotice />
    </main>
  );
}
