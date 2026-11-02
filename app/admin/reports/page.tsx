'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, collectionGroup, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebaseAuth';

type Report = { id: string; reporterUid?: string; reason?: string; status?: string; createdAt?: { toDate?: () => Date } | null; postId: string };

export default function AdminReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getDocs(query(collectionGroup(db, 'reports'), orderBy('createdAt', 'desc'), limit(100)));
      setItems(result.docs.map((entry) => ({
        id: entry.id, postId: entry.ref.parent.parent?.id || '', ...entry.data(),
      }) as Report));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resolve(report: Report) {
    try {
      await updateDoc(doc(db, 'communityPosts', report.postId, 'reports', report.id), { status: 'reviewed' });
      await addDoc(collection(db, 'moderationLogs'), {
        actorEmail: auth.currentUser?.email || '',
        action: 'report_reviewed',
        targetUid: report.reporterUid || 'unknown',
        reason: `Reviewed report on Community post ${report.postId}: ${report.reason || 'No reason supplied'}`,
        createdAt: serverTimestamp(),
      });
      setItems((current) => current.map((item) => item.id === report.id ? { ...item, status: 'reviewed' } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update this report.'); }
  }

  return <div>
    <div className="flex flex-col gap-3 border-b border-[#e5dfd4] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Community · Safety</p><h1 className="mt-2 font-serif text-4xl text-[#292e28]">Reported content</h1><p className="mt-2 text-sm text-[#77766f]">Review reports submitted by community members.</p></div>
      <button onClick={() => void load()} className="rounded-full border border-[#ded9cf] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#575950]">Refresh</button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-[#fbf1ef] p-4 text-sm text-[#934c43]">{error}</p>}
    <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7]">
      {loading ? <p className="p-8 text-sm text-[#77766f]">Loading reports…</p> : items.length === 0 ? <p className="p-8 text-sm text-[#77766f]">No reports have been submitted.</p> :
        <div className="divide-y divide-[#eee9e0]">{items.map((item) => <article key={item.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className={item.status === 'reviewed' ? 'rounded-full bg-[#edf5ed] px-2 py-1 text-[9px] font-bold uppercase text-[#426d48]' : 'rounded-full bg-[#fbf1ef] px-2 py-1 text-[9px] font-bold uppercase text-[#934c43]'}>{item.status || 'open'}</span><span className="text-[10px] text-[#96938a]">{item.createdAt?.toDate?.().toLocaleString() || 'Date unavailable'}</span></div>
          <p className="mt-3 text-sm leading-6 text-[#343832]">{item.reason || 'No reason supplied.'}</p>
          <p className="mt-2 break-all text-[10px] text-[#96938a]">Post ID: {item.postId} · Reporter UID: {item.reporterUid || 'Unknown'}</p>
          {item.status !== 'reviewed' && <button onClick={() => void resolve(item)} className="mt-3 text-[10px] font-bold text-[#765a35] underline underline-offset-4">Mark as reviewed</button>}
        </article>)}</div>}
    </section>
    <p className="mt-3 text-[10px] text-[#96938a]">Showing up to the latest 100 reports. Review a report here, then use Community moderation to hide or remove violating posts.</p>
  </div>;
}
