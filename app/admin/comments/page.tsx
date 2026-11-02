'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAllCommentsForAdmin, deleteComment } from '@/lib/comments';
import { formatRelativeTime } from '@/lib/date';
import type { Comment } from '@/lib/types';

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError('');
    try { setComments(await getAllCommentsForAdmin()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function remove(comment: Comment) {
    if (!window.confirm('Permanently delete this comment?')) return;
    setDeletingId(comment.id); setError('');
    try {
      await deleteComment(comment.id);
      setComments((items) => items.filter((item) => item.id !== comment.id));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setDeletingId(null); }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return comments;
    return comments.filter((comment) => [comment.authorName, comment.text, comment.postTitle].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [comments, search]);

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-[#e5dfd4] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Publication · Moderation</p><h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] text-[#292e28]">Comments</h1><p className="mt-2 text-sm text-[#77766f]">Review reader conversations across published stories.</p></div>
        <button onClick={() => void load()} className="rounded-full border border-[#ded9cf] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#575950] hover:bg-white">Refresh comments</button>
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-[#e6cbc6] bg-[#fbf1ef] px-4 py-3 text-sm text-[#934c43]">{error}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-[#e7e2d8] bg-[#fbfaf7] p-5"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#89877f]">Total comments loaded</p><p className="mt-2 font-serif text-3xl text-[#292e28]">{comments.length}</p></div><div className="rounded-2xl border border-[#e7e2d8] bg-[#fbfaf7] p-5"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#89877f]">Matching comments</p><p className="mt-2 font-serif text-3xl text-[#292e28]">{filtered.length}</p></div></div>
      <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7]">
        <div className="flex flex-col gap-3 border-b border-[#ebe6dc] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl text-[#292e28]">Reader conversations</h2><p className="mt-1 text-[10px] text-[#96938a]">Search by author, comment text or story title.</p></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search comments…" className="w-full rounded-full border border-[#e3ded4] bg-white px-4 py-2.5 text-xs outline-none focus:border-[#b28b53] sm:max-w-[260px]" /></div>
        {loading ? <p className="p-8 text-sm text-[#77766f]">Loading comments…</p> : filtered.length === 0 ? <p className="p-10 text-center text-sm text-[#89877f]">{search ? 'No comments match your search.' : 'No comments yet.'}</p> : <div className="divide-y divide-[#eee9e0]">{filtered.map((comment) => <article key={comment.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:justify-between sm:p-6"><div className="min-w-0"><p className="text-xs font-bold text-[#34372f]">{comment.authorName || 'Reader'} <span className="font-normal text-[#96938a]">· {formatRelativeTime(comment.createdAt)}</span></p><p className="mt-2 break-words text-sm leading-7 text-[#343832]">{comment.text}</p><Link href={`/posts/${comment.postSlug}`} className="mt-3 inline-block text-[10px] font-semibold text-[#765a35] underline decoration-[#c6a36a] underline-offset-4">{comment.postTitle || 'Open related story'} ↗</Link></div><button disabled={deletingId === comment.id} onClick={() => void remove(comment)} className="shrink-0 self-start text-[10px] font-bold text-[#a45a50] underline underline-offset-4 disabled:opacity-40">{deletingId === comment.id ? 'Deleting…' : 'Delete comment'}</button></article>)}</div>}
        <div className="border-t border-[#ebe6dc] bg-[#f8f6f1] px-5 py-3 text-[9px] uppercase tracking-[0.12em] text-[#96938a]">Comment moderation · Actions are recorded by Firebase security rules</div>
      </section>
    </div>
  );
}
