import Link from 'next/link';
import type { Metadata } from 'next';
import { getPublishedInterviews } from '@/lib/interviews';
import { getSettings } from '@/lib/settings';
import { Masthead } from '@/lib/Masthead';
import CopyrightNotice from '@/components/CopyrightNotice';
import { formatDate } from '@/lib/date';
import { Reveal } from '@/lib/Reveal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Interviews',
  description: 'Watch interviews and conversations from UniVerse-City.',
};

export default async function InterviewsPage() {
  const [interviews, settings] = await Promise.all([
    getPublishedInterviews(),
    getSettings(),
  ]);

  return (
    <main>
      <Masthead settings={settings} currentPage="interviews" />
      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <section className="mb-8 border-b border-ink pb-7 sm:mb-10">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
            Watch & listen
          </p>
          <h2 className="font-serif text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">
            Interviews
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            Conversations, perspectives and stories from our community.
          </p>
        </section>

        {interviews.length === 0 ? (
          <div className="border-y border-rule py-16 text-center">
            <p className="font-serif text-2xl">No interviews published yet.</p>
            <p className="mt-2 text-sm text-muted">
              Check back soon for new conversations from UniVerse-City.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {interviews.map((interview, index) => (
              <Reveal key={interview.id} delay={index * 60}>
                <article className="group h-full">
                  <Link href={`/interviews/${interview.id}`} className="block">
                    <div className="editorial-image-reveal relative aspect-video overflow-hidden bg-[#eeece6]">
                      {/* YouTube hosts the thumbnail; no video file is uploaded here. */}
                      <img
                        src={`https://i.ytimg.com/vi/${interview.youtubeVideoId}/hqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/15">
                        <span className="flex h-12 w-16 items-center justify-center rounded-xl bg-red-600 text-white shadow-lg" aria-label="Play interview">
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </span>
                    </div>
                    <div className="pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-brass">
                        Interview · {formatDate(interview.publishAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <h3 className="mt-2 font-serif text-2xl leading-tight tracking-[-0.02em] transition-colors group-hover:text-[#1f3a5f]">
                        {interview.title}
                      </h3>
                      {(interview.shortDescription || interview.description) && (
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                          {interview.shortDescription || interview.description}
                        </p>
                      )}
                    </div>
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        )}
      </div>
      <CopyrightNotice />
    </main>
  );
}
