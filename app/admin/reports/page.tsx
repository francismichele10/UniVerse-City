'use client';

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebaseAuth';
import { isEmailAdmin } from '@/lib/adminAuth';

type Report = {
  id: string;
  reporterUid?: string;
  reason?: string;
  status?: string;
  createdAt?: { toDate?: () => Date } | null;
  postId: string;
  reportedUid?: string;
  reportedName?: string;
  reportedUsername?: string;
  reporterName?: string;
  reporterUsername?: string;
};

export default function AdminReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Read reports through their parent posts. Firestore collection-group
      // queries need a recursive rules match, while our rules intentionally
      // grant report access only under communityPosts.
      const posts = await getDocs(query(
        collection(db, 'communityPosts'),
        orderBy('createdAt', 'desc'),
        limit(200),
      ));

      const reportGroups = await Promise.all(posts.docs.map(async (post) => {
        const postData = post.data();
        const reportedUid = typeof postData.authorUid === 'string' ? postData.authorUid : '';
        let reportedName = typeof postData.authorName === 'string' ? postData.authorName : 'Unknown account';
        let reportedUsername = '';

        // The reported account is the author of the post that the report belongs to.
        // Enrich the post's author details with their public Community profile.
        if (reportedUid) {
          try {
            const profile = await getDoc(doc(db, 'communityProfiles', reportedUid));
            if (profile.exists()) {
              const profileData = profile.data();
              reportedName = profileData.displayName || reportedName;
              reportedUsername = profileData.username || '';
            }
          } catch {
            // Keep the author details already stored on the post if profile lookup fails.
          }
        }

        const reports = await getDocs(query(
          collection(db, 'communityPosts', post.id, 'reports'),
          orderBy('createdAt', 'desc'),
        ));
        return Promise.all(reports.docs.map(async (entry) => {
          const reportData = entry.data();
          const reporterUid = typeof reportData.reporterUid === 'string' ? reportData.reporterUid : '';
          let reporterName = 'Unknown account';
          let reporterUsername = '';

          if (reporterUid) {
            try {
              const reporterProfile = await getDoc(doc(db, 'communityProfiles', reporterUid));
              if (reporterProfile.exists()) {
                const profileData = reporterProfile.data();
                reporterName = profileData.displayName || reporterName;
                reporterUsername = profileData.username || '';
              }
            } catch {
              // Keep the UID visible if the reporter's public profile cannot be loaded.
            }
          }

          return {
            id: entry.id,
            postId: post.id,
            reportedUid,
            reportedName,
            reportedUsername,
            reporterUid,
            reporterName,
            reporterUsername,
            ...reportData,
          } as Report;
        }));
      }));

      const allReports = reportGroups.flat();
      allReports.sort((a, b) => {
        const aDate = a.createdAt?.toDate?.().getTime() || 0;
        const bDate = b.createdAt?.toDate?.().getTime() || 0;
        return bDate - aDate;
      });
      setItems(allReports.slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      if (!user?.email) {
        setLoading(false);
        setError('Sign in with an authorised administrator account to review reports.');
        return;
      }
      try {
        const authorised = await isEmailAdmin(user.email);
        if (!active) return;
        if (!authorised) {
          setLoading(false);
          setError('This account is not authorised to review Community reports.');
          return;
        }
        await load();
      } catch (err) {
        if (!active) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Could not verify administrator access.');
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load]);

  async function resolve(report: Report) {
    setError('');
    try {
      await updateDoc(doc(db, 'communityPosts', report.postId, 'reports', report.id), { status: 'reviewed' });
      await addDoc(collection(db, 'moderationLogs'), {
        actorEmail: auth.currentUser?.email || '',
        action: 'report_reviewed',
        targetUid: report.reportedUid || 'unknown',
        reason: `Reviewed report on Community post ${report.postId} against ${report.reportedName || 'unknown account'} (${report.reportedUid || 'unknown UID'}). Reporter: ${report.reporterUid || 'unknown'}. Reason: ${report.reason || 'No reason supplied'}`,
        createdAt: serverTimestamp(),
      });
      setItems((current) => current.map((item) => item.id === report.id && item.postId === report.postId
        ? { ...item, status: 'reviewed' }
        : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this report.');
    }
  }

  return <div>
    <div className="flex flex-col gap-3 border-b border-[#e5dfd4] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Community · Safety</p>
        <h1 className="mt-2 font-serif text-4xl text-[#292e28]">Reported content</h1>
        <p className="mt-2 text-sm text-[#77766f]">Review reports submitted by community members.</p>
      </div>
      <button onClick={() => void load()} className="rounded-full border border-[#ded9cf] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#575950]">Refresh</button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-[#fbf1ef] p-4 text-sm text-[#934c43]">{error}</p>}
    <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7]">
      {loading ? <p className="p-8 text-sm text-[#77766f]">Loading reports…</p> : items.length === 0 ? <p className="p-8 text-sm text-[#77766f]">No reports have been submitted.</p> :
        <div className="divide-y divide-[#eee9e0]">{items.map((item) => <article key={item.postId + ':' + item.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={item.status === 'reviewed' ? 'rounded-full bg-[#edf5ed] px-2 py-1 text-[9px] font-bold uppercase text-[#426d48]' : 'rounded-full bg-[#fbf1ef] px-2 py-1 text-[9px] font-bold uppercase text-[#934c43]'}>{item.status || 'open'}</span>
            <span className="text-[10px] text-[#96938a]">{item.createdAt?.toDate?.().toLocaleString() || 'Date unavailable'}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#343832]">{item.reason || 'No reason supplied.'}</p>
          <div className="mt-3 space-y-1.5 text-[11px] text-[#77766f]">
            <p className="font-semibold text-[#343832]">Reported account: {item.reportedName || 'Unknown account'}{item.reportedUsername ? ` (@${item.reportedUsername})` : ''}</p>
            <p className="break-all">Reported account UID: <span className="font-mono">{item.reportedUid || 'Unknown'}</span></p>
            <p className="mt-2 font-semibold text-[#343832]">Reported by: {item.reporterName || 'Unknown account'}{item.reporterUsername ? ` (@${item.reporterUsername})` : ''}</p>
            <p className="break-all">Reporter UID: <span className="font-mono">{item.reporterUid || 'Unknown'}</span></p>
            <p className="break-all text-[10px] text-[#96938a]">Post ID: {item.postId}</p>
          </div>
          {item.status !== 'reviewed' && <button onClick={() => void resolve(item)} className="mt-3 text-[10px] font-bold text-[#765a35] underline underline-offset-4">Mark as reviewed</button>}
        </article>)}</div>}
    </section>
    <p className="mt-3 text-[10px] text-[#96938a]">Showing up to the latest 100 reports across the 200 most recent Community posts. Review a report here, then use Community moderation to hide or remove violating posts.</p>
  </div>;
}
