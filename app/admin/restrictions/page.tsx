'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, addDoc,
} from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { watchAdminAuth } from '@/lib/adminAuth';

type RestrictionMode = 'full' | 'post' | 'comment';
type Restriction = {
  uid: string;
  reason: string;
  mode: RestrictionMode;
  active: boolean;
  expiresAt: Timestamp | null;
  updatedAt?: Timestamp;
  updatedBy?: string;
};

const modes: { value: RestrictionMode; label: string; detail: string }[] = [
  { value: 'full', label: 'Full suspension', detail: 'Cannot publish posts or comments.' },
  { value: 'post', label: 'Posting restriction', detail: 'Can comment, but cannot publish posts.' },
  { value: 'comment', label: 'Comment restriction', detail: 'Can publish posts, but cannot comment.' },
];

function expiryLabel(value: Timestamp | null) {
  if (!value) return 'No expiry';
  const date = value.toDate();
  return date.toLocaleString();
}

export default function AdminRestrictionsPage() {
  const [items, setItems] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uid, setUid] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<RestrictionMode>('full');
  const [duration, setDuration] = useState('7');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const snapshot = await getDocs(query(collection(db, 'accountRestrictions'), orderBy('updatedAt', 'desc')));
      setItems(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as Restriction));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load account restrictions.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const unsubscribe = watchAdminAuth((user) => setAdminEmail(user?.email || ''));
    void load();
    return () => unsubscribe();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => !term || [item.uid, item.reason, item.updatedBy].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [items, search]);

  async function applyRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetUid = uid.trim();
    const note = reason.trim();
    if (!targetUid || !note) { setError('Enter the user UID and a reason.'); return; }
    if (targetUid.length < 10) { setError('That UID looks too short. Copy the exact Firebase Auth UID.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const expiresAt = duration === 'permanent'
        ? null
        : Timestamp.fromDate(new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000));
      const record: Restriction = {
        uid: targetUid, reason: note, mode, active: true, expiresAt,
        updatedAt: serverTimestamp() as unknown as Timestamp, updatedBy: adminEmail,
      };
      await setDoc(doc(db, 'accountRestrictions', targetUid), record);
      await addDoc(collection(db, 'moderationLogs'), {
        actorEmail: adminEmail, action: 'restriction_applied', targetUid,
        reason: note, mode, expiresAt, createdAt: serverTimestamp(),
      });
      setUid(''); setReason('');
      setNotice('Account restriction saved. Firestore rules now enforce it for new posts and comments.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this restriction.');
    } finally { setSaving(false); }
  }

  async function lift(item: Restriction) {
    if (!window.confirm(`Lift the restriction for account ${item.uid}?`)) return;
    setError(''); setNotice('');
    try {
      await deleteDoc(doc(db, 'accountRestrictions', item.uid));
      await addDoc(collection(db, 'moderationLogs'), {
        actorEmail: adminEmail, action: 'restriction_lifted', targetUid: item.uid,
        reason: item.reason || 'Restriction lifted', createdAt: serverTimestamp(),
      });
      setItems((current) => current.filter((entry) => entry.uid !== item.uid));
      setNotice('Restriction lifted. The account can participate again.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not lift this restriction.'); }
  }

  function isActive(item: Restriction) {
    return item.active && (!item.expiresAt || item.expiresAt.toDate().getTime() > Date.now());
  }

  return (
    <div>
      <div className="border-b border-[#e5dfd4] pb-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Community · Access control</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] text-[#292e28]">Account restrictions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#77766f]">Temporarily or permanently restrict an account from posting, commenting, or participating. Enforcement happens in Firestore security rules, not just in the interface.</p>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-[#e6cbc6] bg-[#fbf1ef] px-4 py-3 text-sm text-[#934c43]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl border border-[#cfe0d0] bg-[#f0f7f0] px-4 py-3 text-sm text-[#426d48]">{notice}</p>}

      <form onSubmit={applyRestriction} className="mt-7 rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7] p-5 sm:p-7">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#a17b47]">New moderation action</p>
        <h2 className="mt-2 font-serif text-2xl text-[#292e28]">Restrict an account</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]">Firebase Auth user UID
            <input required value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Paste the exact user UID" className="mt-2 w-full rounded-xl border border-[#e3ded4] bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal text-[#343832] outline-none focus:border-[#b28b53]" />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]">Restriction type
            <select value={mode} onChange={(e) => setMode(e.target.value as RestrictionMode)} className="mt-2 w-full rounded-xl border border-[#e3ded4] bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal text-[#343832] outline-none focus:border-[#b28b53]">
              {modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-[#96938a]">{modes.find((item) => item.value === mode)?.detail}</span>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]">Duration
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-2 w-full rounded-xl border border-[#e3ded4] bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal text-[#343832] outline-none focus:border-[#b28b53]">
              <option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="permanent">Indefinite (until lifted)</option>
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#77766f]">Reason
            <textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Record the moderation reason…" className="mt-2 w-full resize-y rounded-xl border border-[#e3ded4] bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal text-[#343832] outline-none focus:border-[#b28b53]" />
          </label>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-5 text-[#96938a]">Use the Firebase Authentication UID, not an email or display name. The reason and staff account are recorded.</p>
          <button disabled={saving} className="rounded-full bg-[#263128] px-6 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:bg-[#39483b] disabled:opacity-50">{saving ? 'Saving…' : 'Apply restriction'}</button>
        </div>
      </form>

      <section className="mt-8 overflow-hidden rounded-[22px] border border-[#e7e2d8] bg-[#fbfaf7]">
        <div className="flex flex-col gap-3 border-b border-[#ebe6dc] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-serif text-xl text-[#292e28]">Restriction register</h2><p className="mt-1 text-[10px] text-[#96938a]">Active, expired and lifted records currently stored in Firebase.</p></div>
          <div className="flex gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search UID or reason…" className="min-w-0 rounded-full border border-[#e3ded4] bg-white px-4 py-2.5 text-xs outline-none focus:border-[#b28b53]" /><button onClick={() => void load()} className="rounded-full border border-[#ded9cf] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#575950]">Refresh</button></div>
        </div>
        {loading ? <p className="p-8 text-sm text-[#77766f]">Loading restriction records…</p> : filtered.length === 0 ? <p className="p-10 text-center text-sm text-[#89877f]">No restriction records found.</p> : <div className="divide-y divide-[#eee9e0]">{filtered.map((item) => <article key={item.uid} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="break-all text-xs font-bold text-[#34372f]">{item.uid}</span><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] ${isActive(item) ? 'bg-[#f7eeee] text-[#934c43]' : 'bg-[#edf5ed] text-[#426d48]'}`}>{isActive(item) ? 'Active' : 'Expired'}</span></div>
          <p className="mt-2 text-xs font-semibold text-[#765a35]">{modes.find((entry) => entry.value === item.mode)?.label || item.mode}</p><p className="mt-1 break-words text-sm text-[#575950]">{item.reason}</p><p className="mt-2 text-[10px] leading-5 text-[#96938a]">Expires: {expiryLabel(item.expiresAt)} · Issued by: {item.updatedBy || 'Unknown staff'}</p></div>
          {isActive(item) && <button onClick={() => void lift(item)} className="shrink-0 self-start text-[10px] font-bold text-[#426d48] underline underline-offset-4">Lift restriction</button>}
        </article>)}</div>}
      </section>
    </div>
  );
}
