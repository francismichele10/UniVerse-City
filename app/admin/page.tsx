'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAllPostsForAdmin, deletePost, setPostStatus } from '@/lib/posts';
import { auth } from '@/lib/firebaseAuth';
import { formatDate } from '@/lib/date';
import type { Post } from '@/lib/types';

const ADMIN_EMAILS = ['francismichele90@gmail.com','gwendolynansong490@gmail.com','kwesicodes@gmail.com','ohemaamercy416@gmail.com','selbybenardo@gmail.com'];

function StatusLabel({ status }: { status: Post['status'] }) {
  const style = status === 'published'
    ? 'border-[#c6ddc8] bg-[#edf5ed] text-[#426d48]'
    : status === 'scheduled'
      ? 'border-[#cbd6e5] bg-[#eef2f8] text-[#4d6483]'
      : 'border-[#e2ded4] bg-[#f5f3ee] text-[#77766f]';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${style}`}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

export default function AdminDashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function loadPosts() {
    setLoading(true); setError('');
    try { setPosts(await getAllPostsForAdmin()); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
    setUser(currentUser); setAuthReady(true);
    if (!currentUser?.email || !ADMIN_EMAILS.includes(currentUser.email.toLowerCase().trim())) {
      setLoading(false); setError('You must be signed in as an administrator.'); return;
    }
    await loadPosts();
  }), []);

  async function publish(id: string) {
    try { await setPostStatus(id, 'published'); await loadPosts(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function remove(id: string) {
    if (!window.confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    try { await deletePost(id); await loadPosts(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const published = posts.filter((post) => post.status === 'published').length;
  const drafts = posts.filter((post) => post.status !== 'published' && post.status !== 'scheduled').length;
  const scheduled = posts.filter((post) => post.status === 'scheduled').length;
  const filteredPosts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter((post) => [post.title, post.category, post.status].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [posts, search]);

  if (!authReady || loading) return <div className="rounded-3xl border border-[#e8e3d9] bg-[#fbfaf7] p-8 text-sm text-[#77766f]">Loading your publication workspace…</div>;
  if (!user) return <div className="rounded-3xl border border-[#e8d8d5] bg-[#fbf3f1] p-6 text-sm text-[#934c43]">You must be signed in as an administrator.</div>;

  return (
    <div>
      <section className="relative overflow-hidden rounded-[26px] bg-[#263128] px-6 py-8 text-white shadow-[0_18px_50px_rgba(38,49,40,0.10)] sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-[#c6a36a]/20" />
        <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-[#c6a36a]/20" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#d2b27d]">Publication desk · Overview</p>
            <h1 className="mt-3 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">Good to see you.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Your editorial workspace is ready. Create something meaningful, keep your stories organised and stay on top of what gets published.</p>
          </div>
          <Link href="/admin/new" className="inline-flex items-center justify-center gap-3 self-start rounded-full bg-[#c6a36a] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#202720] transition hover:bg-[#d8b980] sm:self-auto">Create a story <span className="text-base leading-none">＋</span></Link>
        </div>
        <div className="relative mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[9px] uppercase tracking-[0.16em] text-white/45"><span>Editorial workspace</span><span className="h-1 w-1 rounded-full bg-[#c6a36a]" /><span>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div>
      </section>

      {error && <div role="alert" className="mt-6 rounded-2xl border border-[#e6cbc6] bg-[#fbf1ef] px-4 py-3 text-sm text-[#934c43]">{error}</div>}

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'All stories', value: posts.length, note: 'Across your publication', mark: '▤' },
          { label: 'Published', value: published, note: 'Live on the website', mark: '✓' },
          { label: 'Drafts', value: drafts, note: 'Still being prepared', mark: '✎' },
          { label: 'Scheduled', value: scheduled, note: 'Queued for publishing', mark: '◷' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#e7e2d8] bg-[#fbfaf7] p-5 shadow-[0_5px_20px_rgba(42,42,35,0.025)]">
            <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#89877f]">{item.label}</span><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f0eadf] text-sm text-[#987344]">{item.mark}</span></div>
            <p className="mt-4 font-serif text-4xl tracking-[-0.04em] text-[#292e28]">{item.value}</p>
            <p className="mt-1 text-[10px] text-[#96938a]">{item.note}</p>
          </div>
        ))}
      </section>

      <section className="mt-9 overflow-hidden rounded-[24px] border border-[#e7e2d8] bg-[#fbfaf7] shadow-[0_8px_30px_rgba(42,42,35,0.025)]">
        <div className="flex flex-col gap-4 border-b border-[#ebe6dc] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div><p className="text-[9px] font-bold uppercase tracking-[0.19em] text-[#a17b47]">Content library</p><h2 className="mt-1 font-serif text-2xl tracking-[-0.02em]">Your stories</h2><p className="mt-1 text-[11px] text-[#89877f]">Review, update and publish your editorial work.</p></div>
          <label className="relative block w-full sm:max-w-[260px]"><span className="sr-only">Search stories</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9a978d]">⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stories…" className="w-full rounded-full border border-[#e3ded4] bg-white py-2.5 pl-9 pr-4 text-xs text-[#292e28] outline-none transition placeholder:text-[#aaa69c] focus:border-[#b28b53] focus:ring-2 focus:ring-[#b28b53]/10" /></label>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left">
            <thead><tr className="bg-[#f7f5f0] text-[9px] font-bold uppercase tracking-[0.15em] text-[#96938a]"><th className="px-7 py-3.5">Story</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Category</th><th className="px-4 py-3.5">Last updated</th><th className="px-7 py-3.5 text-right">Actions</th></tr></thead>
            <tbody>{filteredPosts.map((post) => (
              <tr key={post.id} className="border-t border-[#eee9e0] transition hover:bg-[#fdfcf9]">
                <td className="max-w-[390px] px-7 py-4"><p className="truncate font-serif text-[17px] text-[#30352e]">{post.title}</p><p className="mt-1 text-[9px] text-[#aaa69c]">/{post.slug}</p></td>
                <td className="px-4 py-4"><StatusLabel status={post.status} /></td>
                <td className="px-4 py-4 text-[11px] text-[#77766f]">{post.category}</td>
                <td className="px-4 py-4 text-[10px] text-[#96938a]">{formatDate(post.updatedAt, undefined, '—')}</td>
                <td className="px-7 py-4"><div className="flex items-center justify-end gap-3 text-[10px] font-semibold"><Link href={`/admin/new?id=${post.id}`} className="text-[#765a35] underline decoration-[#c6a36a] underline-offset-4 hover:text-[#292e28]">Edit</Link>{post.status !== 'published' && <button onClick={() => publish(post.id)} className="text-[#527653] underline decoration-[#b6cdb7] underline-offset-4">Publish</button>}<button onClick={() => remove(post.id)} className="text-[#a45a50] underline decoration-[#dfbcb5] underline-offset-4">Delete</button></div></td>
              </tr>
            ))}{filteredPosts.length === 0 && <tr><td colSpan={5} className="px-7 py-14 text-center text-xs text-[#96938a]">{search ? 'No stories match your search.' : 'No stories yet. Create your first story to get started.'}</td></tr>}</tbody>
          </table>
        </div>

        <div className="divide-y divide-[#eee9e0] md:hidden">
          {filteredPosts.map((post) => <article key={post.id} className="px-5 py-5"><div className="flex items-start justify-between gap-3"><h3 className="min-w-0 font-serif text-xl leading-tight text-[#30352e]">{post.title}</h3><StatusLabel status={post.status} /></div><p className="mt-2 text-[10px] text-[#96938a]">{post.category} · {formatDate(post.updatedAt, undefined, '—')}</p><div className="mt-4 flex flex-wrap gap-4 text-[10px] font-semibold"><Link href={`/admin/new?id=${post.id}`} className="text-[#765a35] underline decoration-[#c6a36a] underline-offset-4">Edit</Link>{post.status !== 'published' && <button onClick={() => publish(post.id)} className="text-[#527653] underline decoration-[#b6cdb7] underline-offset-4">Publish</button>}<button onClick={() => remove(post.id)} className="text-[#a45a50] underline decoration-[#dfbcb5] underline-offset-4">Delete</button></div></article>)}
          {filteredPosts.length === 0 && <p className="px-5 py-12 text-center text-xs text-[#96938a]">{search ? 'No stories match your search.' : 'No stories yet. Create your first story to get started.'}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-[#ebe6dc] bg-[#f8f6f1] px-5 py-3.5 text-[9px] uppercase tracking-[0.12em] text-[#96938a] sm:px-7"><span>Showing {filteredPosts.length} of {posts.length} stories</span><span>Editorial management</span></div>
      </section>
    </div>
  );
}
