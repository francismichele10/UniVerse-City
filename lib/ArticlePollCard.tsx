'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { app } from '@/lib/firebase';
import { getAuth, type User } from 'firebase/auth';
import type { ArticlePoll } from '@/lib/types';

type Vote = { uid: string; optionId: string };

export function ArticlePollCard({ postId, poll }: { postId: string; poll: ArticlePoll }) {
  const [user, setUser] = useState<User | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshVotes = useCallback(async () => {
    const snapshot = await getDocs(collection(db, 'posts', postId, 'polls', poll.id, 'votes'));
    setVotes(snapshot.docs.map((item) => item.data() as Vote));
  }, [postId, poll.id]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(app), setUser);
    return unsubscribe;
  }, []);

  useEffect(() => {
    refreshVotes().catch(() => setError('Unable to load poll results.'));
    const timer = window.setInterval(() => {
      refreshVotes().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshVotes]);

  const selected = votes.find((vote) => vote.uid === user?.uid)?.optionId ?? null;
  const total = votes.length;

  async function castVote(optionId: string) {
    if (!user) {
      setError('Sign in to vote in this poll.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await setDoc(
        doc(db, 'posts', postId, 'polls', poll.id, 'votes', user.uid),
        { uid: user.uid, optionId, updatedAt: serverTimestamp() }
      );
      await refreshVotes();
    } catch {
      setError('Your vote could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="my-8 rounded-xl border border-rule bg-[#faf9f6] p-5 shadow-sm sm:p-6" aria-label="Article poll">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        <span aria-hidden="true">📊</span> Quick poll
      </div>
      <h2 className="mb-1 text-lg font-semibold leading-snug text-ink">{poll.question}</h2>
      <p className="mb-4 text-xs text-muted">{total} {total === 1 ? 'vote' : 'votes'} · {selected ? 'You can change your vote' : 'Choose one option'}</p>
      <div className="space-y-3">
        {poll.options.map((option) => {
          const count = votes.filter((vote) => vote.optionId === option.id).length;
          const percentage = total ? Math.round((count / total) * 100) : 0;
          return (
            <button key={option.id} type="button" disabled={busy}
              onClick={() => castVote(option.id)}
              className={`relative block w-full overflow-hidden rounded-lg border px-3 py-3 text-left transition ${selected === option.id ? 'border-[#8b7548] bg-[#f4efe3]' : 'border-rule bg-white hover:border-[#b9a57e]'} disabled:cursor-wait`}>
              <span className="absolute inset-y-0 left-0 bg-[#e9e2d2] transition-all duration-500" style={{ width: `${percentage}%` }} />
              <span className="relative flex items-center justify-between gap-3 text-sm text-ink">
                <span className="flex items-center gap-2">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected === option.id ? 'border-[#80683d] bg-[#80683d] text-white' : 'border-[#aaa]'}`}>{selected === option.id ? '✓' : ''}</span>
                  {option.text}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{percentage}% <span className="font-normal text-muted">({count})</span></span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-3 text-xs text-red-700" role="status">{error}</p>}
      {!user && <p className="mt-3 text-xs text-muted">Sign in to cast your vote. Results are visible to everyone.</p>}
    </section>
  );
}
