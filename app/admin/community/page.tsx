'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, updateDoc,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebaseAuth';

type CommunityPost = {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string | null;
  status: 'published' | 'hidden';
  createdAt?: { toDate?: () => Date } | Date | null;
};

const PAGE_SIZE = 25;

function dateLabel(value: CommunityPost['createdAt']) {
  if (!value) return 'Date unavailable';
  const date = value instanceof Date ? value : value.toDate?.();
  return date ? date.toLocaleString() : 'Date unavailable';
}

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'hidden'>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (append = false) => {
    if (append && (!hasMore || loadingMore)) return;
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const constraints = [orderBy('createdAt', 'desc'), ...(append && cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)];
      const snapshot = await getDocs(query(collection(db, 'communityPosts'), ...constraints));
      const nextPosts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CommunityPost);
      setPosts((current) => append ? [...current, ...nextPosts] : nextPosts);
      setCursor(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : append ? cursor : null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Community posts.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore]);

  useEffect(() => { void load(false); }, []); // Initial page only; refresh is explicit.

  const visiblePosts = useMemo(() => posts.filter((post) => {
    const matchesStatus = filter === 'all' || post.status === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [post.text, post.authorName, post.authorUid].some((value) => String(value || '').toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  }), [posts, filter, search]);

  async function refresh() {
    setCursor(null);
    setHasMore(false);
    await load(false);
  }

  async function setVisibility(post: CommunityPost) {
    const next = post.status === 'hidden' ? 'published' : 'hidden';
    setBusyId(post.id); setError('');
    try {
      await updateDoc(doc(db, 'communityPosts', post.id), { status: next });
      await addDoc(collection(db, 'moderationLogs'), {
        actorEmail: auth.currentUser?.email || '',
        action: next === 'hidden' ? 'community_post_hidden' : 'community_post_restored',
        targetUid: post.authorUid,
        reason: `Community post ${post.id}`,
        createdAt: serverTimestamp(),
      });
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, status: next } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this post.');
    } finally { setBusyId(null); }
  }

  async function remove(post: CommunityPost) {
    if (!window.confirm('Permanently delete this Community post?')) return;
    setBusyId(post.id); setError('');
    try {
      await deleteDoc(doc(db, 'communityPosts', post.id));
      await addDoc(collection(db, 'moderationLogs'), {
        actorEmail: auth.currentUser?.email || '',
        action: 'community_post_deleted',
        targetUid: post.authorUid,
        reason: `Community post ${post.id} permanently deleted`,
        createdAt: serverTimestamp(),
      });
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this post.');
    } finally { setBusyId(null); }
  }

  const published = posts.filter((post) => post.status === 'published').length;
  const hidden = posts.filter((post) => post.status === 'hidden').length;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-[#e5dfd4] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Student conversations · Moderation</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] text-[#292e28]">Community</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#77766f]">Review student posts, hide content that needs attention, or remove posts that violate the community guidelines.</p>
        </div>
        <button onClick={() => void refresh()} className="rounded-full border border-[#ded9cf] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#575950] hover:bg-white">Refresh</button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-[#e6cbc6] bg-[#fbf1ef] px-4 py-3 text-sm text-[#934c43]">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[{label:'Posts loaded',value:posts.length},{label:'Published',value:published},{label:'Hidden',value:hidden}].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#e7e2d8] bg-[#fbfaf7] p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#89877f]">{item.label}</p>
            <p className="mt-2 font-serif text-3xl text-[#292e28]">{item.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7]">
        <div className="flex flex-col gap-3 border-b border-[#ebe6dc] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['all','published','hidden'] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-3.5 py-2 text-[9px] font-bold uppercase tracking-[0.12em] ${filter === item ? 'bg-[#263128] text-white' : 'border border-[#e3ded4] text-[#77766f] hover:bg-white'}`}>{item}</button>)}
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loaded posts or authors…" className="w-full rounded-full border border-[#e3ded4] bg-white px-4 py-2.5 text-xs outline-none focus:border-[#b28b53] sm:max-w-[280px]" />
        </div>

        {loading ? <p className="p-8 text-sm text-[#77766f]">Loading Community posts…</p> : visiblePosts.length === 0 ? <p className="p-10 text-center text-sm text-[#89877f]">No posts match this view. Load older posts to search further back.</p> : (
          <div className="divide-y divide-[#eee9e0]">
            {visiblePosts.map((post) => (
              <article key={post.id} className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  {post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eee8dc] text-xs font-bold text-[#76562f]">{post.authorName?.slice(0,1).toUpperCase() || 'U'}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-[#34372f]">{post.authorName || 'Community member'}</span><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] ${post.status === 'hidden' ? 'bg-[#f7eeee] text-[#934c43]' : 'bg-[#edf5ed] text-[#426d48]'}`}>{post.status}</span></div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#343832]">{post.text}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[10px] leading-5 text-[#96938a]">{dateLabel(post.createdAt)} · UID: <span className="break-all">{post.authorUid}</span></div>
                      <div className="flex gap-4 text-[10px] font-bold"><button disabled={busyId === post.id} onClick={() => void setVisibility(post)} className="text-[#765a35] underline underline-offset-4 disabled:opacity-40">{post.status === 'hidden' ? 'Restore post' : 'Hide post'}</button><button disabled={busyId === post.id} onClick={() => void remove(post)} className="text-[#a45a50] underline underline-offset-4 disabled:opacity-40">Delete permanently</button></div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="flex flex-col items-center gap-3 border-t border-[#ebe6dc] bg-[#f8f6f1] px-5 py-4">
          <p className="text-[9px] uppercase tracking-[0.12em] text-[#96938a]">Loaded {posts.length} posts · {hasMore ? 'More posts are available' : 'You have reached the end of the feed'}</p>
          {hasMore && <button disabled={loadingMore} onClick={() => void load(true)} className="rounded-full bg-[#263128] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#39483b] disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load older posts'}</button>}
        </div>
      </section>
    </div>
  );
}
