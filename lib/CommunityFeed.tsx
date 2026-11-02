'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, addDoc, collection } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore/lite';
import {
  COMMUNITY_POST_MAX_LENGTH,
  getCommunityPosts,
  publishCommunityPost,
  removeCommunityPost,
  type CommunityPost,
} from '@/lib/community';
import { signInReader, watchReaderAuth } from '@/lib/readerAuth';
import { formatRelativeTime } from '@/lib/date';
import { getCommunityProfile, type CommunityProfile } from '@/lib/communityProfiles';
import { VerificationBadge } from '@/lib/VerificationBadge';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'U';
}

function Avatar({ name, photoURL, size = 'normal' }: { name: string; photoURL?: string | null; size?: 'normal' | 'small' }) {
  const sizeClass = size === 'small' ? 'h-9 w-9' : 'h-11 w-11';

  if (photoURL) {
    return <img src={photoURL} alt="" className={`${sizeClass} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[#eee8dc] text-xs font-semibold text-[#76562f]`}>
      {initials(name)}
    </div>
  );
}

export function CommunityFeed() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [busyLikeId, setBusyLikeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Record<string, CommunityProfile>>({});
  const [ownProfile, setOwnProfile] = useState<CommunityProfile | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getCommunityPosts();
      setPosts(result.posts);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
      if (user) {
        const liked = await Promise.all(result.posts.map(async (post) => {
          const snap = await getDoc(doc(db, 'communityPosts', post.id, 'likes', user.uid));
          return snap.exists() ? post.id : null;
        }));
        setLikedIds(liked.filter((id): id is string => Boolean(id)));
      }
    } catch {
      setError('We couldn’t load the community posts. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = watchReaderAuth((currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
      if (currentUser) getCommunityProfile(currentUser.uid).then(setOwnProfile).catch(() => setOwnProfile(null));
      else setOwnProfile(null);
    });
    loadFirstPage();
    return () => unsubscribe();
  }, [loadFirstPage]);

  async function handleSignIn() {
    setSigningIn(true);
    setError('');
    try {
      await signInReader();
    } catch {
      setError('Google sign-in was closed or couldn’t be opened. You can try again.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handlePublish() {
    if (!user || !ownProfile || !text.trim() || publishing) return;
    setPublishing(true);
    setError('');

    try {
      await publishCommunityPost({
        text,
        authorUid: user.uid,
        authorName: ownProfile.displayName,
        authorPhotoURL: ownProfile.photoURL,
      });
      setText('');
      await loadFirstPage();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(code === 'permission-denied'
        ? 'Your account currently has a Community posting restriction. If you think this is a mistake, contact the UniVerse-City team.'
        : 'Your post couldn’t be published. Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    let active = true;
    const ids = Array.from(new Set(posts.map(post => post.authorUid))).filter(uid => !profiles[uid]);
    if (ids.length) Promise.all(ids.map(async uid => [uid, await getCommunityProfile(uid)] as const)).then(rows => {
      if (!active) return;
      setProfiles(current => { const next = { ...current }; rows.forEach(([uid, profile]) => { if (profile) next[uid] = profile; }); return next; });
    }).catch(() => {});
    return () => { active = false; };
  }, [posts, profiles]);

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const result = await getCommunityPosts(cursor);
      setPosts((current) => [...current, ...result.posts]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch {
      setError('Couldn’t load more posts. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleLike(postId: string) {
    if (!user) { await handleSignIn(); return; }
    if (busyLikeId) return;
    setBusyLikeId(postId);
    const ref = doc(db, 'communityPosts', postId, 'likes', user.uid);
    const wasLiked = likedIds.includes(postId);
    setLikedIds((ids) => wasLiked ? ids.filter((id) => id !== postId) : [...ids, postId]);
    try {
      if (wasLiked) await deleteDoc(ref);
      else await setDoc(ref, { uid: user.uid, createdAt: serverTimestamp() });
    } catch {
      setLikedIds((ids) => wasLiked ? [...ids, postId] : ids.filter((id) => id !== postId));
      setError('Your like could not be saved. Please try again.');
    } finally { setBusyLikeId(null); }
  }

  async function handleReport(postId: string) {
    if (!user) { await handleSignIn(); return; }
    const reason = window.prompt('Briefly tell us why this post should be reviewed (max 500 characters):');
    if (!reason?.trim()) return;
    try {
      await addDoc(collection(db, 'communityPosts', postId, 'reports'), {
        reporterUid: user.uid, reason: reason.trim().slice(0, 500),
        status: 'open', createdAt: serverTimestamp(),
      });
      setError('');
      window.alert('Thank you. Your report has been sent to the moderation team.');
    } catch {
      setError('Your report could not be submitted. Please try again.');
    }
  }

  async function handleDelete(postId: string) {
    if (!confirm('Delete this post?')) return;
    setDeletingId(postId);
    setError('');
    try {
      await removeCommunityPost(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch {
      setError('That post could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12 lg:py-12">
      <section className="min-w-0">
        <div className="mb-6 border-b border-rule pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">The student conversation</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] text-ink sm:text-4xl">Community feed</h2>
          <p className="mt-2 text-sm leading-6 text-muted">What’s happening on campus? What’s on your mind? Start here.</p>
        </div>

        {authChecked && user && !ownProfile ? <p className="mb-6 rounded-xl border border-rule bg-white p-4 text-sm text-muted">Loading your Community profile…</p> : null}
        {authChecked && user && ownProfile ? (
          <div className="mb-7 rounded-xl border border-rule bg-white p-4 shadow-sm sm:p-5">
            <div className="flex gap-3">
              <Avatar name={user.displayName || user.email || 'You'} photoURL={user.photoURL} />
              <div className="min-w-0 flex-1">
                <label htmlFor="community-post" className="mb-2 block font-serif text-lg text-ink">Start a conversation</label>
                <textarea
                  id="community-post"
                  value={text}
                  onChange={(event) => setText(event.target.value.slice(0, COMMUNITY_POST_MAX_LENGTH))}
                  placeholder="What would you like other students to know?"
                  rows={3}
                  maxLength={COMMUNITY_POST_MAX_LENGTH}
                  className="w-full resize-y rounded-lg border border-rule bg-[#fcfbf8] px-3 py-3 text-sm leading-6 text-ink outline-none transition focus:border-[#a9813f] focus:ring-1 focus:ring-[#a9813f]"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`text-xs ${text.length >= COMMUNITY_POST_MAX_LENGTH ? 'text-[#9b4b3c]' : 'text-muted'}`}>
                    {text.length}/{COMMUNITY_POST_MAX_LENGTH}
                  </span>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing || !text.trim() || !ownProfile}
                    className="rounded-lg bg-[#8b6536] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#73522c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishing ? 'Publishing…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : authChecked ? (
          <div className="mb-7 flex flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-serif text-xl text-ink">Join the conversation</h3>
              <p className="mt-1 text-sm leading-6 text-muted">You can read along without an account. Sign in with Google when you’re ready to post.</p>
            </div>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="shrink-0 rounded-lg bg-[#8b6536] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#73522c] disabled:opacity-60"
            >
              {signingIn ? 'Opening Google…' : 'Sign in with Google'}
            </button>
          </div>
        ) : null}

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-xl text-ink">Recent posts</h3>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Latest first</span>
        </div>

        {loading ? (
          <div className="border-y border-rule py-12 text-center text-sm text-muted">Loading conversations…</div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d8d0c1] bg-[#faf9f6] px-5 py-12 text-center">
            <p className="font-serif text-2xl text-ink">It’s quiet in here. For now.</p>
            <p className="mt-2 text-sm leading-6 text-muted">Be the first to start a conversation with other students.</p>
          </div>
        ) : (
          <div className="divide-y divide-rule border-y border-rule bg-white">
            {posts.map((post) => (
              <article key={post.id} className="px-4 py-5 sm:px-5">
                <div className="flex gap-3">
                  <Avatar name={post.authorName} photoURL={post.authorPhotoURL} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-ink">{profiles[post.authorUid]?.displayName || post.authorName}</span>{profiles[post.authorUid]?.verified && <VerificationBadge className="inline-block h-4 w-4" />}{profiles[post.authorUid]?.username && <Link href={'/community/u/' + profiles[post.authorUid].username} className="text-xs text-muted hover:underline">@{profiles[post.authorUid].username}</Link>}
                      <span className="text-xs text-muted">· {formatRelativeTime(post.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#343832]">{post.text}</p>
                    <div className="mt-3 flex items-center gap-5 text-[11px]">
                      <button type="button" onClick={() => void handleLike(post.id)} disabled={busyLikeId === post.id}
                        aria-pressed={likedIds.includes(post.id)}
                        className={likedIds.includes(post.id) ? 'font-semibold text-[#a34f54]' : 'text-[#77766f] hover:text-[#a34f54]'}>
                        {likedIds.includes(post.id) ? '♥ Liked' : '♡ Like'}
                      </button>
                      {user?.uid !== post.authorUid && <button type="button" onClick={() => void handleReport(post.id)} className="text-[#77766f] hover:text-[#a34f54]">Report</button>}
                    </div>
                    {user?.uid === post.authorUid && (
                      <button
                        type="button"
                        onClick={() => handleDelete(post.id)}
                        disabled={deletingId === post.id}
                        className="mt-3 text-xs text-muted underline decoration-rule underline-offset-4 transition hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingId === post.id ? 'Deleting…' : 'Delete post'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && hasMore && (
          <div className="pt-6 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-lg border border-rule bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition hover:border-[#a9813f] disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more posts'}
            </button>
          </div>
        )}
      </section>

      <aside className="space-y-5 lg:pt-[76px]">
        <div className="rounded-xl border border-rule bg-[#faf9f6] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">A space for students</p>
          <h3 className="mt-2 font-serif text-xl text-ink">Campus life, unfiltered.</h3>
          <p className="mt-2 text-sm leading-6 text-muted">Share what’s happening, ask for advice, exchange ideas and hear different points of view.</p>
        </div>
        <div className="rounded-xl border border-rule bg-white p-5">
          <h3 className="font-serif text-lg text-ink">A few ground rules</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
            <li>• Keep it respectful.</li>
            <li>• Disagree with ideas, not people.</li>
            <li>• Don’t share someone else’s private information.</li>
            <li>• Posts are text-only for now.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
