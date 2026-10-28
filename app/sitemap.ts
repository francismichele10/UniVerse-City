import type { MetadataRoute } from 'next';
import { getPublishedPosts } from '@/lib/posts';
import { getPublishedInterviews } from '@/lib/interviews';
import { getSettings } from '@/lib/settings';

const SITE_URL = 'https://universecityhub.com';

function categorySlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');
}

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, interviews, settings] = await Promise.all([
    getPublishedPosts(),
    getPublishedInterviews(),
    getSettings(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/interviews`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...settings.categories.map((category) => ({
      url: `${SITE_URL}/category/${categorySlug(category)}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];

  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const interviewPages: MetadataRoute.Sitemap = interviews.map((interview) => ({
    url: `${SITE_URL}/interviews/${interview.id}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticPages, ...postPages, ...interviewPages];
}