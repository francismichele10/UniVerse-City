'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
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
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'U';
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
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [openPostMenu, setOpenPostMenu] = useState<string | null>(null);
  const [reportingPost, setReportingPost] = useState<CommunityPost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
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
        return [post.id, likes.size, comments.size] as const;
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
    }
  }

  async function handleReport() {
    if (!user) { await handleSignIn(); return; }
    if (!reportingPost || !reportReason.trim() || submittingReport) return;
    setSubmittingReport(true); setError('');
    try {
      await addDoc(collection(db, 'communityPosts', reportingPost.id, 'reports'), {
        reporterUid: user.uid, reason: reportReason.trim().slice(0, 500), status: 'open', createdAt: serverTimestamp(),
      });
      setReportingPost(null); setReportReason('');
      setNotice('Thank you. This content has been sent to the administrators for review.');
    } catch { setError('Your report could not be submitted. Please try again.'); }
    finally { setSubmittingReport(false); }
  }

  async function handleEditPost() {
    if (!user || !editingPost || !text.trim() || publishing) return;
    const updatedText = text.trim();
    setPublishing(true); setError('');
    try {
      await updateDoc(doc(db, 'communityPosts', editingPost.id), { text: updatedText, editedAt: serverTimestamp() });
      setPosts(current => current.map(post => post.id === editingPost.id ? { ...post, text: updatedText, editedAt: new Date() } : post));
      setComposerOpen(false); setEditingPost(null); setText('');
      setNotice('Your post has been updated.');
    } catch (err) {
      console.error('Community post edit failed:', err);
      const code = (err as { code?: string })?.code;
      setError(code === 'permission-denied'
        ? 'Firestore blocked this edit. The latest firestore.rules must be published in Firebase Console before post editing will work.'
        : 'Your post could not be edited. Please try again.');
    }
    finally { setPublishing(false); }
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

  async function handleShare(post: CommunityPost) {
    const url = `${window.location.origin}/community#post-${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'UniVerse-City Community', text: post.text, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setError('Post link copied. You can now share it.');
      } else window.prompt('Copy this post link:', url);
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') setError('This post could not be shared right now.');
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf6ec]">
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5 sm:px-6 sm:pt-7">
        <div className="mb-5 flex justify-end">
          {authChecked && <div className="rounded-full border border-[#eadfce] bg-[#fffaf2] p-1 shadow-sm">
            <Avatar name={ownProfile?.displayName || user?.displayName || 'UniVerse-City member'} photoURL={ownProfile?.photoURL || user?.photoURL}/>
          </div>}
        </div>

        {notice && <p role="status" className="mb-4 rounded-xl border border-[#d8c7aa] bg-[#f6efdf] px-4 py-3 text-sm text-[#65491f]">{notice}<button type="button" onClick={() => setNotice('')} className="ml-2 font-semibold underline">Dismiss</button></p>}
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? <div className="rounded-[24px] border border-[#eadfce] bg-[#fffaf2] py-14 text-center text-sm text-[#81786c]">Loading conversations…</div>
          : posts.length === 0 ? <div className="rounded-[24px] border border-dashed border-[#d8c7aa] bg-[#fffaf2] px-5 py-14 text-center"><p className="font-serif text-2xl text-[#3e2b19]">It’s quiet in here. For now.</p><p className="mt-2 text-sm leading-6 text-[#81786c]">Be the first to start a conversation with other students.</p></div>
          : <div className="space-y-5">
            {posts.map(post => <article id={`post-${post.id}`} key={post.id} className="overflow-hidden rounded-[24px] border border-[#eadfce] bg-[#fffdf9] px-4 py-4 shadow-[0_4px_16px_rgba(76,53,25,.07)] sm:px-6 sm:py-5">
              <div className="flex items-start gap-3">
                <Avatar name={post.authorName} photoURL={post.authorPhotoURL}/>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="break-words text-[15px] font-semibold text-[#302113]">{profiles[post.authorUid]?.displayName || post.authorName}</span>
                      {profiles[post.authorUid]?.verified && <VerificationBadge className="inline-block h-4 w-4"/>}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                      {profiles[post.authorUid]?.username && <Link href={'/community/u/'+profiles[post.authorUid].username} className="max-w-full break-all text-[13px] text-[#857969] hover:underline">@{profiles[post.authorUid].username}</Link>}
                      <span className="text-[13px] text-[#978b7a] sm:before:content-['·'] sm:before:mr-2">{formatRelativeTime(post.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <button type="button" onClick={() => setOpenPostMenu(current => current === post.id ? null : post.id)} aria-label="Post options" aria-expanded={openPostMenu === post.id} className="rounded-full px-2 py-1 text-xl leading-none text-[#70502c] transition hover:bg-[#f3eadb]">···</button>
                  {openPostMenu === post.id && <div className="absolute right-0 top-9 z-20 min-w-36 overflow-hidden rounded-xl border border-[#eadfce] bg-[#fffdf9] py-1 shadow-xl">
                    {user?.uid === post.authorUid ? <>
                      <button type="button" onClick={() => { setEditingPost(post); setText(post.text); setComposerOpen(true); setOpenPostMenu(null); }} className="block w-full px-4 py-2.5 text-left text-sm text-[#49351f] hover:bg-[#f7efe3]">Edit post</button>
                      <button type="button" onClick={() => { setOpenPostMenu(null); void handleDelete(post.id); }} className="block w-full px-4 py-2.5 text-left text-sm text-[#9b4b42] hover:bg-[#fbefec]">Delete post</button>
                    </> : <button type="button" onClick={() => { if (!user) { setOpenPostMenu(null); void handleSignIn(); return; } setReportingPost(post); setReportReason(''); setOpenPostMenu(null); }} className="block w-full px-4 py-2.5 text-left text-sm text-[#9b4b42] hover:bg-[#fbefec]">Report</button>}
                  </div>}
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap break-words text-[16px] leading-[1.65] text-[#30251b] sm:text-[17px]">{post.text}</p>
              {Boolean(post.editedAt) && <span className="mt-2 inline-block text-[11px] italic text-[#978b7a]">Edited</span>}

              <div className="mt-5 flex items-center justify-between border-t border-[#eee3d3] pt-3">
                <button type="button" onClick={() => void handleLike(post.id)} aria-pressed={likedIds.includes(post.id)}
                  className={`inline-flex min-w-[76px] items-center gap-2 rounded-full px-2 py-1.5 text-sm transition ${likedIds.includes(post.id) ? 'font-semibold text-[#8b4a37]' : 'text-[#76501f] hover:bg-[#f7efe3]'}`}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill={likedIds.includes(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"><path d="M20.8 8.8c0 5.1-8.8 11-8.8 11s-8.8-5.9-8.8-11A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>{likeCounts[post.id] || 0}</span>
                </button>
                <button type="button" onClick={event => { setActivePost(post); event.currentTarget.blur(); }} className="inline-flex min-w-[76px] items-center gap-2 rounded-full px-2 py-1.5 text-sm text-[#76501f] transition hover:bg-[#f7efe3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9813f]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11.5a8 8 0 0 1-8 8H5l1.7-3.1A8 8 0 1 1 20 11.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>{commentCounts[post.id] || 0}</span>
                </button>
                <button type="button" onClick={() => void handleShare(post)} aria-label="Share post" className="rounded-full p-2 text-[#76501f] transition hover:bg-[#f7efe3]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5l7 7-7 7M21 12H9a6 6 0 0 0-6 6"/></svg>
                </button>
              </div>
              {user?.uid === post.authorUid && deletingId === post.id && <p className="mt-2 text-xs text-[#8a7d6b]">Deleting post…</p>}
            </article>)}
          </div>}

        {!loading && hasMore && <div className="pt-7 text-center"><button onClick={() => void handleLoadMore()} disabled={loadingMore} className="rounded-full border border-[#d8c7aa] bg-[#fffaf2] px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#5f4324] hover:border-[#a9813f] disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more posts'}</button></div>}
        <footer className="mt-10 border-t border-[#dfd0b8] pt-5 text-center">
          <p className="font-serif text-sm tracking-wide text-[#76501f]">UniVerse-City</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9a8b76]">Every voice has a story</p>
        </footer>
      </main>

      {authChecked && <button type="button" onClick={() => {
        if (!user) { void handleSignIn(); return; }
        if (!ownProfile) return;
        setEditingPost(null); setText(''); setComposerOpen(true);
      }} aria-label="Create a post"
        className="fixed bottom-6 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full border border-[#d4bd98] bg-[#76501f] text-[#fffaf0] shadow-[0_8px_28px_rgba(70,48,22,.25)] transition hover:-translate-y-1 hover:bg-[#5f3f19] sm:bottom-8 sm:right-8 sm:h-[68px] sm:w-[68px]">
        <QuillIcon/>
      </button>}

      {composerOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#211b13]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) setComposerOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="compose-title" className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#e5ddce] bg-[#fffdf9] shadow-2xl sm:max-w-xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-rule px-4 py-4 sm:px-6"><button onClick={() => { setComposerOpen(false); setEditingPost(null); setText(''); }} className="text-sm text-muted">Cancel</button><h2 id="compose-title" className="font-serif text-lg text-ink">{editingPost ? 'Edit your post' : 'Create a post'}</h2><button onClick={() => void (editingPost ? handleEditPost() : handlePublish())} disabled={!text.trim() || publishing} className="rounded-lg bg-[#8b6536] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{publishing ? 'Saving…' : editingPost ? 'Save changes' : 'Post'}</button></div>
          <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:p-6"><Avatar name={ownProfile?.displayName || 'You'} photoURL={ownProfile?.photoURL}/><div className="min-w-0 flex-1"><textarea autoFocus value={text} onChange={event => setText(event.target.value.slice(0, COMMUNITY_POST_MAX_LENGTH))} maxLength={COMMUNITY_POST_MAX_LENGTH} placeholder="What’s happening in your student community?" className="min-h-[180px] w-full resize-none bg-transparent text-base leading-7 text-ink outline-none placeholder:text-[#a09a8e] sm:min-h-[240px] sm:text-lg"/><div className="border-t border-rule pt-3 text-right text-xs text-muted">{text.length}/{COMMUNITY_POST_MAX_LENGTH}</div></div></div>
        </section>
      </div>}

      {reportingPost && <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[#211b13]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5">
        <section role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full rounded-t-2xl border border-[#e5ddce] bg-[#fffdf9] p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
          <div className="flex items-center justify-between"><h2 id="report-title" className="font-serif text-xl text-[#3e2b19]">Report this post</h2><button type="button" onClick={() => setReportingPost(null)} aria-label="Close report form" className="text-2xl text-[#857969]">×</button></div>
          <p className="mt-2 text-sm leading-6 text-[#81786c]">Tell the administrators why you think this content should be reviewed.</p>
          <textarea autoFocus value={reportReason} onChange={event => setReportReason(event.target.value.slice(0, 500))} maxLength={500} rows={5} placeholder="Enter your reason for reporting…" className="mt-4 w-full resize-y rounded-xl border border-[#eadfce] bg-white p-3 text-sm leading-6 text-[#30251b] outline-none focus:border-[#a9813f]"/>
          <div className="mt-1 flex items-center justify-between text-xs text-[#978b7a]"><span>Please provide a clear reason.</span><span>{reportReason.length}/500</span></div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setReportingPost(null)} className="rounded-full px-4 py-2.5 text-sm text-[#76501f] hover:bg-[#f7efe3]">Cancel</button><button type="button" onClick={() => void handleReport()} disabled={!reportReason.trim() || submittingReport} className="rounded-full bg-[#76501f] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{submittingReport ? 'Sending…' : 'Report'}</button></div>
        </section>
      </div>}

      {activePost && <CommentDrawer post={activePost} profile={profiles[activePost.authorUid]} user={user} ownProfile={ownProfile} onClose={() => { setActivePost(null); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }} onSignIn={handleSignIn} onCommentAdded={() => setCommentCounts(current => ({ ...current, [activePost.id]: (current[activePost.id] || 0) + 1 }))}/>}
    </div>
  );
}

function CommentDrawer({ post, profile, user, ownProfile, onClose, onSignIn, onCommentAdded }: {
  post: CommunityPost; profile?: CommunityProfile; user: User | null; ownProfile: CommunityProfile | null;
  onClose: () => void; onSignIn: () => Promise<void>; onCommentAdded: () => void;
}) {
  const [size] = useState<'full'>('full');
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentProfiles, setCommentProfiles] = useState<Record<string, CommunityProfile>>({});
  const [commentLikes, setCommentLikes] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'communityPosts', post.id, 'comments'), orderBy('createdAt', 'asc')));
      const rows = snap.docs.map(item => ({ id: item.id, ...item.data() } as CommunityComment));
      setComments(rows);
      const authorIds = Array.from(new Set(rows.map(item => item.authorUid))).filter(uid => !commentProfiles[uid]);
      if (authorIds.length) {
        const profiles = await Promise.all(authorIds.map(async uid => [uid, await getCommunityProfile(uid)] as const));
        setCommentProfiles(current => {
          const next = { ...current };
          profiles.forEach(([uid, profile]) => { if (profile) next[uid] = profile; });
          return next;
        });
      }
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
      onCommentAdded();
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
    return <div key={comment.id} className={isReply ? 'ml-5 border-l border-[#e9e2d6] pl-2 sm:ml-7 sm:pl-3' : ''}>
      <div className={isReply ? 'flex gap-2 py-1.5' : 'flex gap-2.5 py-2.5'}>
        <Avatar name={comment.authorName} photoURL={comment.authorPhotoURL} size="small"/>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="inline-flex flex-wrap items-center gap-1.5 break-words text-[13px] font-semibold text-ink">{commentProfiles[comment.authorUid]?.displayName || comment.authorName}{commentProfiles[comment.authorUid]?.verified && <VerificationBadge className="inline-block h-3.5 w-3.5"/>}</span><span className="text-[10px] text-muted">{formatRelativeTime(comment.createdAt)}</span></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#45443e]">{comment.text}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
            {!isReply && <button onClick={() => { setReplyTo(comment); setDraft(''); document.getElementById('community-comment-input')?.focus(); }} className="hover:text-[#8b6536]">Reply</button>}
          </div>
        </div>
        <div className="flex w-7 shrink-0 flex-col items-center pt-1">
          <button type="button" onClick={() => void toggleCommentLike(comment)} aria-label={myLikes.includes(comment.id) ? 'Unlike comment' : 'Like comment'} aria-pressed={myLikes.includes(comment.id)} className={`rounded-full p-1 transition-colors ${myLikes.includes(comment.id) ? 'text-[#e25563]' : 'text-[#9b9a94] hover:text-[#e25563]'}`}>
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill={myLikes.includes(comment.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 8.8c0 5.1-8.8 11-8.8 11s-8.8-5.9-8.8-11A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z"/></svg>
          </button>
          {commentLikes[comment.id] > 0 && <span className="text-[10px] leading-3 text-muted">{commentLikes[comment.id]}</span>}
        </div>
      </div>
      {children.map(reply => renderComment(reply, true))}
    </div>;
  }

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#211b13]/45 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Comments" style={{ transform: dragOffset ? `translateY(${Math.max(0, dragOffset)}px)` : undefined, transition: isDragging ? 'none' : 'transform 280ms cubic-bezier(.22,1,.36,1), height 280ms cubic-bezier(.22,1,.36,1)' }} className={`flex w-full flex-col overflow-hidden rounded-t-2xl border border-[#e5ddce] bg-[#fffdf9] shadow-2xl will-change-transform sm:max-w-2xl sm:rounded-2xl h-[96dvh] sm:h-[88vh]`}>
      <div className="shrink-0 border-b border-rule">
        <div
          className="flex h-9 touch-none cursor-grab items-center justify-center active:cursor-grabbing sm:hidden"
          onPointerDown={event => { setDragStart(event.clientY); setIsDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (dragStart !== null) setDragOffset(event.clientY - dragStart); }}
          onPointerUp={event => {
            if (dragStart === null) return;
            const delta = event.clientY - dragStart;
            if (delta > 90) onClose();
            setDragStart(null); setDragOffset(0); setIsDragging(false);
          }}
          onPointerCancel={() => { setDragStart(null); setDragOffset(0); setIsDragging(false); }}
        >
          <span className="h-1.5 w-10 rounded-full bg-[#c9c1b4]"/>
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-1 sm:px-5 sm:py-4">
          <button onClick={onClose} className="text-sm text-muted sm:hidden">Close</button>
          <h2 className="flex-1 text-center font-serif text-lg text-ink sm:text-left">Comments</h2>
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
