'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';

type LogEntry = {
  id: string;
  actorEmail?: string;
  action?: string;
  targetUid?: string;
  reason?: string;
  mode?: string;
  createdAt?: { toDate?: () => Date } | null;
};

export default function AdminModerationLogPage() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await getDocs(query(collection(db, 'moderationLogs'), orderBy('createdAt', 'desc'), limit(100)));
      setItems(result.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as LogEntry));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the moderation history.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div>
    <div className="flex flex-col gap-3 border-b border-[#e5dfd4] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Community · Accountability</p><h1 className="mt-2 font-serif text-4xl text-[#292e28]">Moderation history</h1><p className="mt-2 text-sm text-[#77766f]">Recent account restriction actions recorded by the admin workspace.</p></div>
      <button onClick={() => void load()} className="rounded-full border border-[#ded9cf] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#575950]">Refresh</button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-[#fbf1ef] p-4 text-sm text-[#934c43]">{error}</p>}
    <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7]">
      {loading ? <p className="p-8 text-sm text-[#77766f]">Loading history…</p> : items.length === 0 ? <p className="p-8 text-sm text-[#77766f]">No moderation actions have been recorded yet.</p> :
        <div className="divide-y divide-[#eee9e0]">{items.map((item) => <article key={item.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-[#34372f]">{(item.action || 'moderation_action').replaceAll('_', ' ')}</span><span className="text-[10px] text-[#96938a]">{item.createdAt?.toDate?.().toLocaleString() || 'Date unavailable'}</span></div>
          <p className="mt-2 break-all text-[11px] text-[#77766f]">Account UID: {item.targetUid || 'Not recorded'}</p>
          <p className="mt-1 text-[11px] text-[#77766f]">Staff: {item.actorEmail || 'Unknown'}{item.mode ? ` · Type: ${item.mode}` : ''}</p>
          {item.reason && <p className="mt-2 text-sm leading-6 text-[#343832]">{item.reason}</p>}
        </article>)}</div>}
    </section>
    <p className="mt-3 text-[10px] text-[#96938a]">Showing up to the latest 100 entries. Logs are read-only in this interface.</p>
  </div>;
}
