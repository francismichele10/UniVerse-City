
import Link from 'next/link';
import { getPublishedPosts } from '@/lib/posts';
import { getSettings } from '@/lib/settings';
import { Masthead } from '@/lib/Masthead';
import { formatDate } from '@/lib/date';
import CopyrightNotice from '@/components/CopyrightNotice';
import { TrendingNow } from '@/lib/TrendingNow';
import { Reveal } from '@/lib/Reveal';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [posts, settings] = await Promise.all([
    getPublishedPosts(),
    getSettings(),
  ]);

  const [lead, ...rest] = posts;

  const secondary = rest.slice(0, 6);
  const more = rest.slice(6, 9);

  return (
    <>
      <main>
        <Masthead settings={settings} />

        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          {/* Popular */}
          <section className="py-7 sm:py-9">
            <Reveal>
              <TrendingNow />
            </Reveal>

            {!lead && (
              <div className="border-y border-rule py-16 text-center">
                <p className="font-serif text-2xl">No stories yet.</p>

                <p className="mt-2 text-sm text-muted">
                  New stories will appear here when they are published.
                </p>
              </div>
            )}

            {lead && (
              <Reveal className="border-b border-ink pb-8">
                <Link
                  href={`/posts/${lead.slug}`}
                  className="group grid gap-6 lg:grid-cols-[1.08fr_.92fr] lg:gap-10"
                >
                  <div className="order-2 lg:order-1 lg:py-3">
                    <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
                      {lead.category}
                    </div>

                    <h2 className="max-w-3xl font-serif text-4xl leading-[1.03] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                      {lead.title}
                    </h2>

                    <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#484c46] sm:text-base">
                      {lead.excerpt}
                    </p>

                    <div className="mt-5 text-xs text-muted">
                      {lead.authorName} ·{' '}
                      {formatDate(
                        lead.publishAt,
                        {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        },
                        '—'
                      )}
                    </div>

                    <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy underline decoration-brass underline-offset-4">
                      Read story →
                    </div>
                  </div>

                  {lead.coverImageUrl && (
                    <div className="order-1 overflow-hidden bg-[#e8e5dc] lg:order-2">
                      <img
                        src={lead.coverImageUrl}
                        alt=""
                        className="aspect-[4/3] h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                      />
                    </div>
                  )}
                </Link>
              </Reveal>
            )}
          </section>

          {/* Latest Stories */}
          {secondary.length > 0 && (
            <section className="border-b border-rule pb-14 sm:pb-16">
              <div className="mb-5 flex items-end justify-between border-b border-rule pb-2">
                <h2 className="font-serif text-2xl">Latest stories</h2>

                <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
                  New
                </span>
              </div>

              <div className="grid gap-x-8 md:grid-cols-2">
                {secondary.map((post, index) => (
                  <Reveal
                    key={`reveal-${post.id}`}
                    delay={index * 60}
                  >
                    <Link
                      href={`/posts/${post.slug}`}
                      className="group flex gap-4 border-b border-rule py-5"
                    >
                      {post.coverImageUrl && (
                        <div className="h-24 w-28 shrink-0 overflow-hidden bg-[#e8e5dc] sm:h-28 sm:w-36">
                          <img
                            src={post.coverImageUrl}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">
                          {post.category}
                        </div>

                        <h3 className="font-serif text-xl leading-tight tracking-[-0.015em]">
                          {post.title}
                        </h3>

                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                          {post.excerpt}
                        </p>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* More from UniVerse-City */}
          {more.length > 0 && (
            <section className="border-t border-rule py-12 sm:py-16">
              <div className="mb-7 border-b border-rule pb-3">
                <h2 className="font-serif text-2xl">
                  More from UniVerse-City
                </h2>
              </div>

              <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 sm:gap-y-4 lg:grid-cols-3">
                {more.map((post, index) => (
                  <Reveal
                    key={`reveal-more-${post.id}`}
                    delay={index * 60}
                  >
                    <Link
                      href={`/posts/${post.slug}`}
                      className="group border-b border-rule py-6"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">
                        {post.category}
                      </div>

                      <h3 className="mt-2 font-serif text-xl leading-tight">
                        {post.title}
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-muted">
                        {post.excerpt}
                      </p>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Student Submissions */}
        <section className="border-t border-rule">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
            <div className="border-y border-ink py-9 sm:py-11">
              <div className="mx-auto max-w-3xl text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
                  Student submissions
                </div>

                <h2 className="mt-3 font-serif text-3xl leading-tight tracking-[-0.025em] sm:text-4xl">
                  Have something to say?
                </h2>

                <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-7 text-[#484c46] sm:text-base">
                  Share your story, opinion, poem, article, idea, or experience
                  with UniVerse-City.
                </p>

                <div className="mt-6">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">
                    Send your submission to
                  </p>

                  <a
                    href="mailto:submit@universecityhub.com"
                    className="mt-2 inline-block max-w-full break-all font-serif text-xl text-navy underline decoration-brass underline-offset-4 transition-opacity hover:opacity-70 sm:text-2xl"
                  >
                    submit@universecityhub.com
                  </a>
                </div>

                <div className="mx-auto mt-7 max-w-2xl border-t border-rule pt-5 text-left">
                  <p className="text-sm leading-6 text-muted">
                    <span className="font-semibold text-[#484c46]">
                      Submission note:
                    </span>{' '}
                    Attach your blog as a Word document (.doc or .docx) and
                    include one image. In the email, briefly explain what your
                    blog is about. Please remember to add a clear title in the
                    subject line.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <CopyrightNotice />
      </main>
    </>
  );
}
