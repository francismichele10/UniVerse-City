// Firestore data model for the student blog

export type PostStatus = 'draft' | 'scheduled' | 'published';

export interface Post {
  id: string;              // Firestore doc id
  title: string;
  slug: string;            // URL-friendly, unique, used for /posts/[slug]
  excerpt: string;         // short summary for cards/SEO
  body: string;            // HTML from the rich text editor
  coverImageUrl: string | null;
  category: string;        // e.g. "Announcements", "Sports", "Academics"
  tags: string[];
  status: PostStatus;
  publishAt: Date;         // when it should go live (also used for scheduling)
  authorId: string;        // admin's uid
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaItem {
  id: string;
  url: string;
  path: string;            // storage path, needed for deletion
  fileName: string;
  uploadedBy: string;
  createdAt: Date;
}

// A single comment on a post, at collection `comments`.
// postId/postSlug/postTitle are stored on the comment itself (denormalized)
// so the post page can query by postId, and the admin moderation page can
// list every comment site-wide without a separate lookup per post.
export interface Comment {
  id: string;
  postId: string;
  postSlug: string;
  postTitle: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL: string | null;
  text: string;
  createdAt: Date;
}

export interface AdminUser {
  email: string;
  displayName: string;
  addedAt: Date;
}

// Single document at settings/site — edited from /admin/settings
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  photoPath: string | null;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  estYear: string;
  categories: string[]; // available options in the post editor + public nav
  aboutIntro: string;
  team: TeamMember[];
}


export type InterviewStatus = 'draft' | 'published';

export interface Interview {
  id: string;
  title: string;
  description: string;
  shortDescription?: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  status: InterviewStatus;
  publishAt: Date;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}
