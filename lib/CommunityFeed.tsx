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
    <div className="min-h-screen bg-[#090a0b] text-[#f4f1eb]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[245px_minmax(0,650px)_300px] lg:gap-8 lg:px-8">
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-white/[0.07] lg:py-7 lg:pr-6">
          <Link href="/community" className="flex items-center gap-3 px-3">
            <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain" />
            <span className="font-serif text-xl font-semibold tracking-tight">UniVerse<span className="text-[#bd9258]">.</span></span>
          </Link>
          <p className="mt-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#77736b]">Community</p>
          <nav className="mt-9 space-y-2 text-sm">
            <Link href="/community" className="flex items-center gap-4 rounded-xl bg-[#bd9258]/[0.13] px-4 py-3.5 font-semibold text-[#e0b879]"><span className="text-lg">⌂</span> Home</Link>
            {user && <Link href={ownProfile?.username ? '/community/u/' + ownProfile.username : '/community'} className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-[#aaa69f] transition hover:bg-white/[0.05] hover:text-white"><span className="text-lg">◎</span> My profile</Link>}
          </nav>
          <div className="mt-auto space-y-4">
            <Link href="/" className="block rounded-xl border border-white/[0.09] px-4 py-3 text-xs text-[#aaa69f] transition hover:border-[#bd9258]/50 hover:text-white">← Back to UniVerse-City</Link>
            {user ? (
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
                <Avatar name={ownProfile?.displayName || user.displayName || 'You'} photoURL={ownProfile?.photoURL || user.photoURL} size="small" />
                <div className="min-w-0"><p className="truncate text-xs font-semibold">{ownProfile?.displayName || user.displayName || 'Your account'}</p><p className="truncate text-[11px] text-[#77736b]">@{ownProfile?.username || 'member'}</p></div>
              </div>
            ) : <button type="button" onClick={handleSignIn} disabled={signingIn} className="w-full rounded-xl bg-[#bd9258] px-4 py-3 text-sm font-semibold text-[#17120c] transition hover:bg-[#d2aa73]">{signingIn ? 'Opening Google…' : 'Sign in'}</button>}
          </div>
        </aside>

        <main className="min-w-0 border-x border-white/[0.06]">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.08] bg-[#090a0b]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3 lg:hidden">
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-contain" />
              <div><p className="font-serif text-lg font-semibold leading-none">UniVerse<span className="text-[#bd9258]">.</span></p><p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-[#77736b]">Community</p></div>
            </div>
            <div className="hidden lg:block"><p className="font-semibold">Home</p><p className="mt-0.5 text-[11px] text-[#77736b]">The student conversation</p></div>
            <span className="rounded-full border border-[#bd9258]/25 bg-[#bd9258]/[0.08] px-3 py-1 text-[10px] font-medium tracking-wide text-[#d2aa73]">STUDENT SPACE</span>
          </header>

          <div className="border-b border-white/[0.08] px-4 py-5 sm:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#bd9258]">Your campus. Your voice.</p>
            <h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">The Community</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[#96928a]">A place for students to share ideas, ask questions and keep up with campus conversations.</p>
          </div>

          {authChecked && user && !ownProfile ? <p className="m-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-[#aaa69f]">Loading your Community profile…</p> : null}
          {authChecked && user && ownProfile ? (
            <div className="border-b border-white/[0.08] p-4 sm:p-6">
              <div className="rounded-2xl border border-white/[0.09] bg-[#111315] p-4 sm:p-5">
                <div className="flex gap-3">
                  <Avatar name={ownProfile.displayName || user.displayName || 'You'} photoURL={ownProfile.photoURL || user.photoURL} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="community-post" className="mb-2 block text-sm font-semibold text-[#e9e5dd]">Start a conversation</label>
                    <textarea id="community-post" value={text} onChange={(event) => setText(event.target.value.slice(0, COMMUNITY_POST_MAX_LENGTH))} placeholder="What's happening on your mind?" rows={3} maxLength={COMMUNITY_POST_MAX_LENGTH} className="w-full resize-y border-0 bg-transparent px-0 py-2 text-sm leading-6 text-white outline-none placeholder:text-[#66635e] focus:ring-0" />
                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3">
                      <span className={`text-[11px] ${text.length >= COMMUNITY_POST_MAX_LENGTH ? 'text-red-400' : 'text-[#77736b]'}`}>{text.length}/{COMMUNITY_POST_MAX_LENGTH}</span>
                      <button type="button" onClick={handlePublish} disabled={publishing || !text.trim() || !ownProfile} className="rounded-full bg-[#bd9258] px-5 py-2 text-xs font-bold text-[#17120c] transition hover:bg-[#d2aa73] disabled:cursor-not-allowed disabled:opacity-40">{publishing ? 'Posting…' : 'Publish post'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : authChecked ? (
            <div className="border-b border-white/[0.08] p-4 sm:p-6"><div className="flex flex-col gap-3 rounded-2xl border border-white/[0.09] bg-[#111315] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl">Join the conversation</h2><p className="mt-1 text-sm text-[#96928a]">Read posts freely. Sign in with Google to publish and like.</p></div><button type="button" onClick={handleSignIn} disabled={signingIn} className="rounded-full bg-[#bd9258] px-5 py-2.5 text-xs font-bold text-[#17120c]">{signingIn ? 'Opening Google…' : 'Continue with Google'}</button></div></div>
          ) : null}

          {error && <p role="alert" className="mx-4 mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300 sm:mx-6">{error}</p>}

          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <h2 className="text-sm font-semibold">Latest conversations</h2><span className="text-[10px] uppercase tracking-[0.15em] text-[#77736b]">Newest first</span>
          </div>

          {loading ? <div className="border-y border-white/[0.07] py-16 text-center text-sm text-[#77736b]">Loading conversations…</div> : posts.length === 0 ? (
            <div className="mx-4 mb-6 rounded-2xl border border-dashed border-white/[0.13] px-5 py-14 text-center sm:mx-6"><p className="font-serif text-2xl">It's quiet in here.</p><p className="mt-2 text-sm text-[#96928a]">Be the first to start a conversation.</p></div>
          ) : (
            <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {posts.map((post) => (
                <article key={post.id} className="px-4 py-5 transition hover:bg-white/[0.015] sm:px-6">
                  <div className="flex gap-3">
                    <Avatar name={profiles[post.authorUid]?.displayName || post.authorName} photoURL={profiles[post.authorUid]?.photoURL || post.authorPhotoURL} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-[#f1eee8]">{profiles[post.authorUid]?.displayName || post.authorName}</span>{profiles[post.authorUid]?.verified && <VerificationBadge className="inline-block -ml-1 h-4 w-4" />}{profiles[post.authorUid]?.username && <Link href={'/community/u/' + profiles[post.authorUid].username} className="text-xs text-[#858078] hover:text-[#d2aa73]">@{profiles[post.authorUid].username}</Link>}<span className="text-xs text-[#77736b]">· {formatRelativeTime(post.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#d8d4cd]">{post.text}</p>
                      <div className="mt-4 flex items-center gap-6 text-xs">
                        <button type="button" onClick={() => void handleLike(post.id)} disabled={busyLikeId === post.id} aria-pressed={likedIds.includes(post.id)} className={likedIds.includes(post.id) ? 'font-semibold text-rose-400' : 'text-[#8b877f] transition hover:text-rose-400'}>{likedIds.includes(post.id) ? '♥ Liked' : '♡ Like'}</button>
                        {user?.uid !== post.authorUid && <button type="button" onClick={() => void handleReport(post.id)} className="text-[#8b877f] transition hover:text-[#d2aa73]">Report</button>}
                        {user?.uid === post.authorUid && <button type="button" onClick={() => handleDelete(post.id)} disabled={deletingId === post.id} className="ml-auto text-[#8b877f] transition hover:text-red-400">{deletingId === post.id ? 'Deleting…' : 'Delete'}</button>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && hasMore && <div className="px-4 py-7 text-center"><button type="button" onClick={handleLoadMore} disabled={loadingMore} className="rounded-full border border-white/[0.13] px-6 py-2.5 text-xs font-semibold text-[#d8d4cd] transition hover:border-[#bd9258]/50 disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load more posts'}</button></div>}
          <footer className="px-5 py-8 text-center text-[10px] text-[#5e5b55]">A student space by UniVerse-City · <Link href="/" className="text-[#a88a60] hover:underline">Visit publication</Link></footer>
        </main>

        <aside className="hidden space-y-5 py-7 lg:block">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111315] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#bd9258]">The UniVerse</p>
            <h3 className="mt-2 font-serif text-2xl leading-tight">Student life, in one place.</h3>
            <p className="mt-2 text-xs leading-6 text-[#96928a]">Discover what students are thinking, share your perspective and find your people.</p>
            <Link href="/" className="mt-4 inline-flex text-xs font-semibold text-[#d2aa73] hover:underline">Explore UniVerse-City →</Link>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111315] p-5">
            <h3 className="text-sm font-semibold">Community guidelines</h3>
            <ul className="mt-3 space-y-3 text-xs leading-5 text-[#96928a]"><li><span className="mr-2 text-[#bd9258]">01</span> Keep conversations respectful.</li><li><span className="mr-2 text-[#bd9258]">02</span> Challenge ideas, not people.</li><li><span className="mr-2 text-[#bd9258]">03</span> Respect everyone's privacy.</li><li><span className="mr-2 text-[#bd9258]">04</span> Posts are text-only for now.</li></ul>
          </div>
          <div className="px-2 text-[10px] leading-5 text-[#5e5b55]">Independent student voices. Shared campus experiences.</div>
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/[0.09] bg-[#0d0f10]/95 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-3 backdrop-blur-xl lg:hidden">
        <Link href="/community" className="flex flex-col items-center gap-1 text-[#d2aa73]"><span className="text-xl">⌂</span><span className="text-[9px]">Home</span></Link>
        {user && <Link href={ownProfile?.username ? '/community/u/' + ownProfile.username : '/community'} className="flex flex-col items-center gap-1 text-[#8b877f]"><span className="text-xl">◎</span><span className="text-[9px]">Profile</span></Link>}
        {!user && <button type="button" onClick={handleSignIn} className="flex flex-col items-center gap-1 text-[#8b877f]"><span className="text-xl">↗</span><span className="text-[9px]">Sign in</span></button>}
      </nav>
      <div className="h-20 lg:hidden" />
    </div>
  );
}
