import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/posts';
import { Comments } from '@/lib/CommentsSection';
import { LikeButton } from '@/lib/LikeButton';
import { formatDate } from '@/lib/date';
import { ViewTracker } from '@/lib/ViewTracker';
import { ArticlePollCard } from '@/lib/ArticlePollCard';
import type { ArticlePoll } from '@/lib/types';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/posts/${post.slug}` },
    openGraph: {
      type: 'article', title: post.title, description: post.excerpt, url: `/posts/${post.slug}`,
      images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined,
    },
  };
}

function toSlug(cat: string) {
  return cat.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');
}

function formatOldHashtags(html: string): string {
  if (!html) return html;
  const protectedHashtags: string[] = [];
  let processed = html.replace(/<span[^>]*class=["'][^"']*hashtag-blue[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, (match) => {
    protectedHashtags.push(match);
    return `___HASHTAG_BLUE_${protectedHashtags.length - 1}___`;
  });
  processed = processed.replace(/(^|[\s>])(#(?:[A-Za-z0-9_]+(?:[-'][A-Za-z0-9_]+)*))/g, '$1<span class="hashtag-blue">$2</span>');
  return processed.replace(/___HASHTAG_BLUE_(\d+)___/g, (_, index) => protectedHashtags[Number(index)]);
}


function renderBodyWithPolls(body: string, polls: Record<string, ArticlePoll> | undefined, postId: string): ReactNode[] {
  const marker = /<div\\b(?=[^>]*data-article-poll)(?=[^>]*data-poll-id=["']([^"']+)["'])[^>]*>[\\s\\S]*?<\\/div>/gi;
  const output: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(body)) !== null) {
    if (match.index > cursor) {
      output.push(<div key={`body-${cursor}`} dangerouslySetInnerHTML={{ __html: formatOldHashtags(body.slice(cursor, match.index)) }} />);
    }
    const poll = polls?.[match[1]];
    if (poll) output.push(<ArticlePollCard key={`poll-${poll.id}`} postId={postId} poll={poll} />);
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    output.push(<div key={`body-${cursor}`} dangerouslySetInnerHTML={{ __html: formatOldHashtags(body.slice(cursor)) }} />);
  }
  return output;
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post || post.status !== 'published') notFound();

  return (
    <main>
      <ViewTracker postId={post.id} />

      <article className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link href={`/category/${toSlug(post.category)}`} className="editorial-link text-xs">← Back to {post.category}</Link>

        <div className="mx-auto mt-6 max-w-3xl">
          <h1 className="font-serif text-4xl leading-[1.04] tracking-[-0.035em] sm:text-5xl lg:text-6xl">{post.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#484c46]">{post.excerpt}</p>
          <div className="mt-5 border-b border-rule pb-5 text-xs text-muted">By {post.authorName} · {formatDate(post.publishAt, { month: 'long', day: 'numeric', year: 'numeric' }, '—')}</div>

          {post.coverImageUrl && (
            <figure className="mt-7 overflow-hidden bg-[#e8e5dc]">
              <img src={post.coverImageUrl} alt={post.title} className="max-h-[620px] w-full object-cover" />
            </figure>
          )}

          <div className="post-body mt-8 text-[16px] leading-8 text-[#2b2f2c]">{renderBodyWithPolls(post.body, post.polls, post.id)}</div>

          {post.tags.length > 0 && (
            <div className="mt-8 border-t border-rule pt-5">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {post.tags.map((tag) => <span key={tag} className="text-xs text-muted">#{tag}</span>)}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-6 border-y border-rule py-4">
            <LikeButton postId={post.id} />
            <span className="text-xs text-muted">{post.tags.length ? `${post.tags.length} tags` : 'Join the conversation below'}</span>
          </div>

          <Comments postId={post.id} postSlug={post.slug} postTitle={post.title} />
        </div>
      </article>
    </main>
  );
}
