import type { Metadata } from 'next';
import { CommunityGate } from '@/lib/CommunityGate';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Join student conversations, share ideas and talk about campus life on UniVerse-City.',
};

export const dynamic = 'force-dynamic';

export default function CommunityPage() {
  return (
    <main className="min-h-screen bg-[#090a0b]">
      <CommunityGate />
    </main>
  );
}
