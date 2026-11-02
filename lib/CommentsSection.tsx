'use client';

import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { getCommentsForPost, addComment, deleteComment } from '@/lib/comments';
import { signInReader, watchReaderAuth } from '@/lib/readerAuth';
import { formatRelativeTime } from '@/lib/date';
import type { Comment } from '@/lib/types';

function initialsFor(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

export function Comments({
  postId,
  postSlug,
  postTitle,
}: {
  postId: string;
  postSlug: string;
  postTitle: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = watchReaderAuth((u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getCommentsForPost(postId)
      .then(setComments)
      .catch(() => setError('Comments could not be loaded. Please refresh and try again.'))
      .finally(() => setLoading(false));
  }, [postId]);

  async function handlePost() {
    if (!user || !text.trim()) return;
    setPosting(true);
    setError('');
    try {
      await addComment({
        postId,
        postSlug,
        postTitle,
        authorUid: user.uid,
        authorName: user.displayName || user.email || 'Anonymous',
        authorPhotoURL: user.photoURL,
        text: text.trim(),
      });
      setText('');
      setComments(await getCommentsForPost(postId));
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(code === 'permission-denied'
        ? 'Your account currently has a Community commenting restriction. If you think this is a mistake, contact the UniVerse-City team.'
        : 'Could not post your comment — please try again.');
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this comment?')) return;
    setDeletingId(id);
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError('Could not delete that comment — please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSignIn() {
    setError('');
    try {
      await signInReader();
    } catch {
      // Popup closed or blocked — nothing worth surfacing, they can just retry.
    }
  }

  return (
    <div className="mt-8 border-t border-rule pt-6">
      <h2 className="mb-4 font-serif text-lg text-ink">
        Comments
        {comments.length > 0 && (
          <span className="ml-1.5 font-sans text-sm font-normal text-muted">({comments.length})</span>
        )}
      </h2>

      {loading ? (
        <p className="text-sm text-muted">Loading comments…</p>
      ) : (
        <div className="mb-5 space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-rule bg-paper-raised text-xs font-semibold text-navy">
                {initialsFor(c.authorName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-semibold text-ink">{c.authorName}</span>
                  <span className="ml-2 text-xs text-muted">{formatRelativeTime(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#2b2f2c]">
                  {c.text}
                </p>
                {user && user.uid === c.authorUid && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="mt-1 text-xs text-red-700 underline disabled:opacity-50"
                  >
                    {deletingId === c.id ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-muted">No comments yet — be the first.</p>}
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red-700">{error}</p>}

      {!authChecked ? null : user ? (
        <div className="flex gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-rule bg-paper-raised text-xs font-semibold text-navy">
            {initialsFor(user.displayName || user.email || '?')}
          </div>
          <div className="flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              maxLength={1000}
              className="w-full rounded-sm border border-rule bg-paper-raised px-3 py-2 text-sm"
            />
            <div className="mt-1.5 text-right">
              <button
                onClick={handlePost}
                disabled={posting || !text.trim()}
                className="border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-paper hover:bg-[#343934] disabled:opacity-50"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-sm border border-rule bg-paper-raised p-4 text-center">
          <p className="mb-2.5 text-sm text-muted">Sign in to join the conversation</p>
          <button
            onClick={handleSignIn}
            className="border border-ink bg-ink px-4 py-2 text-xs font-semibold text-paper hover:bg-[#343934]"
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}
