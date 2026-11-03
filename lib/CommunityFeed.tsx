'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, where,
} from 'firebase/firestore/lite';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import {
  COMMUNITY_POST_MAX_LENGTH, getCommunityPosts, publishCommunityPost,
  removeCommunityPost, type CommunityPost,
} from '@/lib/community';
import { signInReader, watchReaderAuth } from '@/lib/readerAuth';
import { formatRelativeTime } from '@/lib/date';
import { getCommunityProfile, type CommunityProfile } from '@/lib/communityProfiles';
import { VerificationBadge } from '@/lib/VerificationBadge';

type CommunityComment = {
  id: string; text: string; authorUid: string; authorName: string;
  authorPhotoURL: string | null; parentId: string | null; createdAt: unknown;
};

function initials(name: string) {
  return name.trim().split(/\\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'U';
}

function Avatar({ name, photoURL, size = 'normal' }: { name: string; photoURL?: string | null; size?: 'normal' | 'small' }) {
  const sizeClass = size === 'small' ? 'h-8 w-8' : 'h-11 w-11';
  return photoURL
    ? <img src={photoURL} alt="" className={`${sizeClass} shrink-0 rounded-full object-cover`} />
    : <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[#eee8dc] text-xs font-semibold text-[#76562f]`}>{initials(name)}</div>;
}

function QuillIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="h-7 w-7" fill="none">
    <path d="M39.5 6.5C26 7 14 13.2 11.2 24.3c-1.2 4.7.7 8.8 4.5 10.2 5.2 1.9 10.4-2.3 12.8-7.1C32.2 20.1 35.2 12.4 39.5 6.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M8 41c8.3-12.2 17.1-21.1 29.5-33.5M17 31l-5.5-1.5M23 24l-1-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="m8 41 8-3-5-5-3 8Z" fill="currentColor"/>
  </svg>;
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [busyLikeId, setBusyLikeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Record<string, CommunityProfile>>({});
  const [ownProfile, setOwnProfile] = useState<CommunityProfile | null>(null);
  const [activePost, setActivePost] = useState<CommunityPost | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getCommunityPosts();
      setPosts(result.posts); setCursor(result.cursor); setHasMore(result.hasMore);

      // Post retrieval is the critical path. Counts and personal like state are
      // supplementary, so a denied/missing subcollection must not hide the feed.
      const countResults = await Promise.allSettled(result.posts.map(async post => {
        const [likes, comments] = await Promise.all([
          getDocs(collection(db, 'communityPosts', post.id, 'likes')),
          getDocs(collection(db, 'communityPosts', post.id, 'comments')),
        ]);
        return [post.id, likes.size, comments.docs.filter(item => !item.data().parentId).length] as const;
      }));
      const nextLikes: Record<string, number> = {};
      const nextComments: Record<string, number> = {};
      countResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const [id, likes, comments] = result.value;
          nextLikes[id] = likes;
          nextComments[id] = comments;
        } else {
          console.error('Community post counts could not be loaded:', result.reason);
        }
      });
      setLikeCounts(nextLikes);
      setCommentCounts(nextComments);

      if (user) {
        const likedResults = await Promise.allSettled(result.posts.map(async post =>
          (await getDoc(doc(db, 'communityPosts', post.id, 'likes', user.uid))).exists() ? post.id : null));
        setLikedIds(likedResults.flatMap(item => item.status === 'fulfilled' && item.value ? [item.value] : []));
        likedResults.filter(item => item.status === 'rejected').forEach(item => console.error('Community like state could not be loaded:', item.reason));
      } else setLikedIds([]);
    } catch (err) {
      console.error('Community feed request failed:', err);
      const code = (err as { code?: string })?.code;
      setError(code === 'failed-precondition'
        ? 'The Community feed needs a Firestore index. Please contact the site administrator.'
        : code === 'permission-denied'
          ? 'Access to Community posts was denied. Please check the Firestore security rules.'
          : 'We couldn’t load the community posts. Please refresh and try again.');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    const unsubscribe = watchReaderAuth(currentUser => {
      setUser(currentUser); setAuthChecked(true);
      if (currentUser) getCommunityProfile(currentUser.uid).then(setOwnProfile).catch(() => setOwnProfile(null));
      else setOwnProfile(null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => { void loadFirstPage(); }, [loadFirstPage]);

  useEffect(() => {
    let active = true;
    const ids = Array.from(new Set(posts.map(post => post.authorUid))).filter(uid => !profiles[uid]);
    if (ids.length) Promise.all(ids.map(async uid => [uid, await getCommunityProfile(uid)] as const)).then(rows => {
      if (!active) return;
      setProfiles(current => { const next = { ...current }; rows.forEach(([uid, profile]) => { if (profile) next[uid] = profile; }); return next; });
    }).catch(() => {});
    return () => { active = false; };
  }, [posts, profiles]);

  async function handleSignIn() {
    setSigningIn(true); setError('');
    try { await signInReader(); }
    catch { setError('Google sign-in was closed or couldn’t be opened. You can try again.'); }
    finally { setSigningIn(false); }
  }

  async function handlePublish() {
    if (!user) { await handleSignIn(); return; }
    if (!ownProfile || !text.trim() || publishing) return;
    setPublishing(true); setError('');
    try {
      await publishCommunityPost({ text, authorUid: user.uid, authorName: ownProfile.displayName, authorPhotoURL: ownProfile.photoURL });
      setText(''); setComposerOpen(false); await loadFirstPage();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(code === 'permission-denied'
        ? 'Your account currently has a Community posting restriction. If you think this is a mistake, contact the UniVerse-City team.'
        : 'Your post couldn’t be published. Please try again.');
    } finally { setPublishing(false); }
  }

  async function handleLike(postId: string) {
    if (!user) { await handleSignIn(); return; }
    if (busyLikeId) return;
    setBusyLikeId(postId);
    const ref = doc(db, 'communityPosts', postId, 'likes', user.uid);
    const wasLiked = likedIds.includes(postId);
    setLikedIds(ids => wasLiked ? ids.filter(id => id !== postId) : [...ids, postId]);
    setLikeCounts(counts => ({ ...counts, [postId]: Math.max(0, (counts[postId] || 0) + (wasLiked ? -1 : 1)) }));
    try {
      if (wasLiked) await deleteDoc(ref);
      else await setDoc(ref, { uid: user.uid, createdAt: serverTimestamp() });
    } catch {
      setLikedIds(ids => wasLiked ? [...ids, postId] : ids.filter(id => id !== postId));
      setLikeCounts(counts => ({ ...counts, [postId]: Math.max(0, (counts[postId] || 0) + (wasLiked ? 1 : -1)) }));
      setError('Your like could not be saved. Please try again.');
    } finally { setBusyLikeId(null); }
  }

  async function handleReport(postId: string) {
    if (!user) { await handleSignIn(); return; }
    const reason = window.prompt('Briefly tell us why this post should be reviewed (max 500 characters):');
    if (!reason?.trim()) return;
    try {
      await addDoc(collection(db, 'communityPosts', postId, 'reports'), {
        reporterUid: user.uid, reason: reason.trim().slice(0, 500), status: 'open', createdAt: serverTimestamp(),
      });
      window.alert('Thank you. Your report has been sent to the moderation team.');
    } catch { setError('Your report could not be submitted. Please try again.'); }
  }

  async function handleDelete(postId: string) {
    if (!confirm('Delete this post?')) return;
    setDeletingId(postId); setError('');
    try { await removeCommunityPost(postId); setPosts(current => current.filter(post => post.id !== postId)); }
    catch { setError('That post could not be deleted.'); }
    finally { setDeletingId(null); }
  }

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setError('');
    try {
      const result = await getCommunityPosts(cursor);
      setPosts(current => [...current, ...result.posts]); setCursor(result.cursor); setHasMore(result.hasMore);
      const counts = await Promise.all(result.posts.map(async post => {
        const [likes, comments] = await Promise.all([
          getDocs(collection(db, 'communityPosts', post.id, 'likes')),
          getDocs(collection(db, 'communityPosts', post.id, 'comments')),
        ]);
        return [post.id, likes.size, comments.docs.filter(item => !item.data().parentId).length] as const;
      }));
      setLikeCounts(current => ({ ...current, ...Object.fromEntries(counts.map(([id, likes]) => [id, likes])) }));
      setCommentCounts(current => ({ ...current, ...Object.fromEntries(counts.map(([id, , comments]) => [id, comments])) }));
    } catch { setError('Couldn’t load more posts. Please try again.'); }
    finally { setLoadingMore(false); }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-5 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
      <section className="min-w-0">
        <div className="mb-5 border-b border-rule pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">The student conversation</p>
          <h2 className="mt-1 font-serif text-2xl tracking-[-0.03em] text-ink sm:text-3xl">Community feed</h2>
          <p className="mt-1 text-sm leading-6 text-muted">What’s happening on campus? What’s on your mind? Start here.</p>
        </div>

        {authChecked && user && !ownProfile && <p className="mb-5 rounded-xl border border-rule bg-white p-4 text-sm text-muted">Loading your Community profile…</p>}
        {authChecked && !user && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-white p-4">
          <div><h3 className="font-serif text-lg text-ink">Join the conversation</h3><p className="text-sm text-muted">Sign in with Google when you’re ready to post or comment.</p></div>
          <button onClick={() => void handleSignIn()} disabled={signingIn} className="rounded-lg bg-[#8b6536] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{signingIn ? 'Opening Google…' : 'Sign in'}</button>
        </div>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mb-3 flex items-center justify-between"><h3 className="font-serif text-lg text-ink">Recent posts</h3><span className="text-[10px] uppercase tracking-[0.14em] text-muted">Latest first</span></div>
        {loading ? <div className="border-y border-rule py-12 text-center text-sm text-muted">Loading conversations…</div>
          : posts.length === 0 ? <div className="rounded-xl border border-dashed border-[#d8d0c1] bg-[#faf9f6] px-5 py-12 text-center"><p className="font-serif text-2xl text-ink">It’s quiet in here. For now.</p><p className="mt-2 text-sm leading-6 text-muted">Be the first to start a conversation with other students.</p></div>
          : <div className="divide-y divide-rule border-y border-rule bg-white">
            {posts.map(post => <article key={post.id} className="px-3 py-5 sm:px-5">
              <div className="flex gap-3">
                <Avatar name={post.authorName} photoURL={post.authorPhotoURL}/>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words text-sm font-semibold text-ink">{profiles[post.authorUid]?.displayName || post.authorName}</span>
                    {profiles[post.authorUid]?.verified && <VerificationBadge className="inline-block h-4 w-4 -ml-1"/>}
                    {profiles[post.authorUid]?.username && <Link href={'/community/u/'+profiles[post.authorUid].username} className="max-w-full break-all text-xs text-muted hover:underline">@{profiles[post.authorUid].username}</Link>}
                    <span className="text-xs text-muted">· {formatRelativeTime(post.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#343832]">{post.text}</p>
                  <div className="mt-4 flex items-center gap-7 text-xs">
                    <button type="button" onClick={() => void handleLike(post.id)} disabled={busyLikeId === post.id} aria-pressed={likedIds.includes(post.id)}
                      className={`inline-flex items-center gap-2 transition ${likedIds.includes(post.id) ? 'font-semibold text-[#9b4b52]' : 'text-[#77766f] hover:text-[#9b4b52]'}`}>
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill={likedIds.includes(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"><path d="M20.8 8.8c0 5.1-8.8 11-8.8 11s-8.8-5.9-8.8-11A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span className="sr-only">Like</span><span>{likeCounts[post.id] || 0}</span>
                    </button>
                    <button type="button" onClick={() => setActivePost(post)} className="inline-flex items-center gap-2 text-[#77766f] transition hover:text-[#8b6536]">
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11.5a8 8 0 0 1-8 8H5l1.7-3.1A8 8 0 1 1 20 11.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span className="sr-only">Comment</span><span>{commentCounts[post.id] || 0}</span>
                    </button>
                  </div>
                  {user?.uid !== post.authorUid && <button type="button" onClick={() => void handleReport(post.id)} className="mt-3 text-[11px] text-muted hover:text-[#9b4b52]">Report</button>}
                  {user?.uid === post.authorUid && <button type="button" onClick={() => void handleDelete(post.id)} disabled={deletingId === post.id} className="mt-3 text-[11px] text-muted underline underline-offset-4 hover:text-red-700 disabled:opacity-50">{deletingId === post.id ? 'Deleting…' : 'Delete post'}</button>}
                </div>
              </div>
            </article>)}
          </div>}
        {!loading && hasMore && <div className="pt-6 text-center"><button onClick={() => void handleLoadMore()} disabled={loadingMore} className="rounded-lg border border-rule bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink hover:border-[#a9813f] disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more posts'}</button></div>}
      </section>

      <aside className="hidden space-y-5 lg:block lg:pt-[70px]">
        <div className="rounded-xl border border-rule bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">Find your people</p>
          <h3 className="mt-2 font-serif text-xl text-ink">Who to follow</h3>
          <p className="mt-2 text-sm leading-6 text-muted">Discover students and join more conversations across the community.</p>
          <p className="mt-4 border-t border-rule pt-3 text-xs leading-5 text-muted">More profile suggestions are coming soon.</p>
        </div>
      </aside>

      {authChecked && user && ownProfile && <button type="button" onClick={() => { setText(''); setComposerOpen(true); }} aria-label="Create a post"
        className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-[#d4bd98] bg-[#8b6536] text-[#fffaf0] shadow-[0_8px_28px_rgba(70,48,22,.25)] transition hover:-translate-y-1 hover:bg-[#73522c] sm:bottom-8 sm:right-8 sm:h-16 sm:w-16">
        <QuillIcon/>
      </button>}

      {composerOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#211b13]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) setComposerOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="compose-title" className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#e5ddce] bg-[#fffdf9] shadow-2xl sm:max-w-xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-rule px-4 py-4 sm:px-6"><button onClick={() => setComposerOpen(false)} className="text-sm text-muted">Cancel</button><h2 id="compose-title" className="font-serif text-lg text-ink">Create a post</h2><button onClick={() => void handlePublish()} disabled={!text.trim() || publishing} className="rounded-lg bg-[#8b6536] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{publishing ? 'Posting…' : 'Post'}</button></div>
          <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:p-6"><Avatar name={ownProfile?.displayName || 'You'} photoURL={ownProfile?.photoURL}/><div className="min-w-0 flex-1"><textarea autoFocus value={text} onChange={event => setText(event.target.value.slice(0, COMMUNITY_POST_MAX_LENGTH))} maxLength={COMMUNITY_POST_MAX_LENGTH} placeholder="What’s happening in your student community?" className="min-h-[180px] w-full resize-none bg-transparent text-base leading-7 text-ink outline-none placeholder:text-[#a09a8e] sm:min-h-[240px] sm:text-lg"/><div className="border-t border-rule pt-3 text-right text-xs text-muted">{text.length}/{COMMUNITY_POST_MAX_LENGTH}</div></div></div>
        </section>
      </div>}

      {activePost && <CommentDrawer post={activePost} profile={profiles[activePost.authorUid]} user={user} ownProfile={ownProfile} onClose={() => setActivePost(null)} onSignIn={handleSignIn}/>}
    </div>
  );
}

function CommentDrawer({ post, profile, user, ownProfile, onClose, onSignIn }: {
  post: CommunityPost; profile?: CommunityProfile; user: User | null; ownProfile: CommunityProfile | null;
  onClose: () => void; onSignIn: () => Promise<void>;
}) {
  const [size, setSize] = useState<'half' | 'full'>('half');
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentLikes, setCommentLikes] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragStart, setDragStart] = useState<number | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'communityPosts', post.id, 'comments'), orderBy('createdAt', 'asc')));
      const rows = snap.docs.map(item => ({ id: item.id, ...item.data() } as CommunityComment));
      setComments(rows);
      const counts = await Promise.all(rows.map(async item => {
        const likes = await getDocs(collection(db, 'communityPosts', post.id, 'comments', item.id, 'likes'));
        return [item.id, likes.size] as const;
      }));
      setCommentLikes(Object.fromEntries(counts));
      if (user) {
        const liked = await Promise.all(rows.map(async item => (await getDoc(doc(db, 'communityPosts', post.id, 'comments', item.id, 'likes', user.uid))).exists() ? item.id : null));
        setMyLikes(liked.filter((id): id is string => Boolean(id)));
      }
    } catch { setError('Comments could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }, [post.id, user]);

  useEffect(() => { void loadComments(); }, [loadComments]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const roots = useMemo(() => comments.filter(comment => !comment.parentId), [comments]);
  const replies = useMemo(() => comments.filter(comment => Boolean(comment.parentId)), [comments]);

  async function submitComment() {
    if (!user) { await onSignIn(); return; }
    if (!ownProfile || !draft.trim() || sending) return;
    setSending(true); setError('');
    try {
      await addDoc(collection(db, 'communityPosts', post.id, 'comments'), {
        text: draft.trim().slice(0, 1000), authorUid: user.uid, authorName: ownProfile.displayName,
        authorPhotoURL: ownProfile.photoURL, parentId: replyTo?.id || null, createdAt: serverTimestamp(),
      });
      setDraft(''); setReplyTo(null); await loadComments();
    } catch { setError('Your comment could not be published. Please try again.'); }
    finally { setSending(false); }
  }

  async function toggleCommentLike(comment: CommunityComment) {
    if (!user) { await onSignIn(); return; }
    const ref = doc(db, 'communityPosts', post.id, 'comments', comment.id, 'likes', user.uid);
    const liked = myLikes.includes(comment.id);
    setMyLikes(current => liked ? current.filter(id => id !== comment.id) : [...current, comment.id]);
    setCommentLikes(current => ({ ...current, [comment.id]: Math.max(0, (current[comment.id] || 0) + (liked ? -1 : 1)) }));
    try { if (liked) await deleteDoc(ref); else await setDoc(ref, { uid: user.uid, createdAt: serverTimestamp() }); }
    catch { setError('Your like could not be saved.'); void loadComments(); }
  }

  function renderComment(comment: CommunityComment, isReply = false) {
    const children = replies.filter(reply => reply.parentId === comment.id);
    return <div key={comment.id} className={isReply ? 'ml-9 border-l border-[#e9e2d6] pl-3 sm:ml-11 sm:pl-4' : ''}>
      <div className="flex gap-2.5 py-3">
        <Avatar name={comment.authorName} photoURL={comment.authorPhotoURL} size="small"/>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="break-words text-[13px] font-semibold text-ink">{comment.authorName}</span><span className="text-[10px] text-muted">{formatRelativeTime(comment.createdAt)}</span></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#45443e]">{comment.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
            <button onClick={() => void toggleCommentLike(comment)} className={myLikes.includes(comment.id) ? 'font-semibold text-[#9b4b52]' : 'hover:text-[#9b4b52]'}>{myLikes.includes(comment.id) ? 'Liked' : 'Like'}{commentLikes[comment.id] ? ` · ${commentLikes[comment.id]}` : ''}</button>
            {!isReply && <button onClick={() => { setReplyTo(comment); setDraft(''); document.getElementById('community-comment-input')?.focus(); }} className="hover:text-[#8b6536]">Reply</button>}
          </div>
        </div>
      </div>
      {children.map(reply => renderComment(reply, true))}
    </div>;
  }

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#211b13]/45 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Comments" className={`flex w-full flex-col overflow-hidden rounded-t-2xl border border-[#e5ddce] bg-[#fffdf9] shadow-2xl transition-[height,max-height] duration-200 sm:max-w-2xl sm:rounded-2xl ${size === 'full' ? 'h-[96dvh] sm:h-[88vh]' : 'h-[62dvh] sm:h-[min(680px,78vh)]'}`}>
      <div className="shrink-0 border-b border-rule">
        <div className="flex h-7 items-center justify-center sm:hidden" onTouchStart={event => setDragStart(event.touches[0].clientY)} onTouchEnd={event => {
          if (dragStart === null) return;
          const delta = event.changedTouches[0].clientY - dragStart;
          if (delta < -35) setSize('full');
          else if (delta > 35) { if (size === 'full') setSize('half'); else onClose(); }
          setDragStart(null);
        }}>
          <button aria-label={size === 'half' ? 'Expand comments' : 'Collapse comments'} onClick={() => setSize(current => current === 'half' ? 'full' : 'half')} className="h-1.5 w-10 rounded-full bg-[#c9c1b4]"/>
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-1 sm:px-5 sm:py-4">
          <button onClick={onClose} className="text-sm text-muted sm:hidden">Close</button>
          <h2 className="flex-1 text-center font-serif text-lg text-ink sm:text-left">Comments</h2>
          <button onClick={() => setSize(current => current === 'half' ? 'full' : 'half')} className="hidden text-xs text-muted hover:text-ink sm:block">{size === 'half' ? 'Expand' : 'Collapse'}</button>
          <button onClick={onClose} aria-label="Close comments" className="hidden text-xl leading-none text-muted sm:block">×</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5">
        <div className="flex gap-3 border-b border-rule py-4">
          <Avatar name={post.authorName} photoURL={post.authorPhotoURL}/>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><span className="text-sm font-semibold text-ink">{profile?.displayName || post.authorName}</span>{profile?.verified && <VerificationBadge className="inline-block h-4 w-4"/>}<span className="text-[10px] text-muted">{formatRelativeTime(post.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#45443e]">{post.text}</p></div>
        </div>
        {loading ? <p className="py-8 text-center text-sm text-muted">Loading comments…</p>
          : roots.length ? <div className="divide-y divide-[#f0ece4]">{roots.map(comment => renderComment(comment))}</div>
          : <div className="py-10 text-center"><p className="font-serif text-xl text-ink">Start the conversation</p><p className="mt-1 text-sm text-muted">Be the first to comment on this post.</p></div>}
        {error && <p role="alert" className="py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="shrink-0 border-t border-rule bg-[#fffdf9] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        {replyTo && <div className="mb-2 flex items-center justify-between text-xs text-muted"><span>Replying to <strong className="text-ink">{replyTo.authorName}</strong></span><button onClick={() => setReplyTo(null)} className="underline underline-offset-2">Cancel</button></div>}
        <div className="flex items-end gap-2">
          <Avatar name={ownProfile?.displayName || user?.displayName || 'You'} photoURL={ownProfile?.photoURL || user?.photoURL} size="small"/>
          <textarea id="community-comment-input" value={draft} onChange={event => setDraft(event.target.value.slice(0, 1000))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitComment(); } }} rows={1} placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'} className="max-h-28 min-h-10 min-w-0 flex-1 resize-y rounded-2xl border border-rule bg-white px-3 py-2.5 text-[13px] leading-5 text-ink outline-none focus:border-[#a9813f]"/>
          <button onClick={() => void submitComment()} disabled={!draft.trim() || sending} className="shrink-0 rounded-xl bg-[#8b6536] px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{sending ? '…' : 'Post'}</button>
        </div>
      </div>
    </section>
  </div>;
}
