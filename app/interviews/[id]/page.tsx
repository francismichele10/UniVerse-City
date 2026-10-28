import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublishedInterviewById } from '@/lib/interviews';
import { getPublishedInterviews } from '@/lib/interviews';
import { getSettings } from '@/lib/settings';
import { Masthead } from '@/lib/Masthead';
import { formatDate } from '@/lib/date';
import CopyrightNotice from '@/components/CopyrightNotice';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const interview = await getPublishedInterviewById(id);
  return interview
    ? { title: interview.title, description: interview.description || `Watch ${interview.title} on UniVerse-City.` }
    : { title: 'Interview not found' };
}

export default async function InterviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [interview, settings] = await Promise.all([
    getPublishedInterviewById(id),
    getSettings(),
  ]);
  if (!interview) notFound();

  const moreInterviews = (await getPublishedInterviews())
    .filter((item) => item.id !== interview.id)
    .slice(0, 3);

  return (
    <main>
      <Masthead settings={settings} currentPage="interviews" />
      <article className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <Link href="/interviews" className="editorial-link text-xs font-semibold uppercase tracking-[0.12em]">
          ← All interviews
        </Link>
        <header className="mx-auto mt-6 max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
            Interview · {formatDate(interview.publishAt, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">
            {interview.title}
          </h2>
          {interview.description && (
            <p className="mt-4 text-base leading-7 text-muted">{interview.description}</p>
          )}
        </header>

        <div className="mt-8 aspect-video overflow-hidden bg-black shadow-sm">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${interview.youtubeVideoId}`}
            title={interview.title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {moreInterviews.length > 0 && (
          <section className="mt-12 border-t border-rule pt-8">
            <h3 className="font-serif text-2xl">More interviews</h3>
            <div className="mt-5 grid gap-6 sm:grid-cols-3">
              {moreInterviews.map((item) => (
                <Link key={item.id} href={`/interviews/${item.id}`} className="group">
                  <div className="aspect-video overflow-hidden bg-[#eeece6]">
                    <img
                      src={`https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-3 font-serif text-lg leading-tight group-hover:text-[#1f3a5f]">{item.title}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
      <CopyrightNotice />
    </main>
  );
}
