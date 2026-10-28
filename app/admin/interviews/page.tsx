'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createInterview,
  deleteInterview,
  getAllInterviewsForAdmin,
  getYouTubeVideoId,
  setInterviewStatus,
  updateInterview,
} from '@/lib/interviews';
import { auth } from '@/lib/firebaseAuth';
import { formatDate, toDate } from '@/lib/date';
import type { Interview, InterviewStatus } from '@/lib/types';

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusLabel(status: InterviewStatus) {
  return (
    <span className={`inline-flex border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
      status === 'published' ? 'border-[#b8cdb7] text-[#37613c]' : 'border-rule text-muted'
    }`}>
      {status}
    </span>
  );
}

export default function AdminInterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [status, setStatus] = useState<InterviewStatus>('draft');

  const loadInterviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setInterviews(await getAllInterviewsForAdmin());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load interviews.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPublishAt(todayValue());
    void loadInterviews();
  }, [loadInterviews]);

  function resetForm() {
    setEditingId(null);
    setYoutubeUrl('');
    setTitle('');
    setDescription('');
    setPublishAt(todayValue());
    setStatus('draft');
    setError('');
    setNotice('');
  }

  function startEditing(interview: Interview) {
    setEditingId(interview.id);
    setYoutubeUrl(interview.youtubeUrl);
    setTitle(interview.title);
    setDescription(interview.description || '');
    const date = toDate(interview.publishAt);
    setPublishAt(date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : todayValue());
    setStatus(interview.status);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const cleanTitle = title.trim();
    const cleanUrl = youtubeUrl.trim();
    const videoId = getYouTubeVideoId(cleanUrl);

    if (!cleanTitle) {
      setError('Please enter an interview title.');
      return;
    }
    if (!videoId) {
      setError('Enter a valid YouTube video link (watch, youtu.be, shorts, live or embed URL).');
      return;
    }
    if (!publishAt) {
      setError('Choose a publication date.');
      return;
    }

    setSaving(true);
    try {
      const data = {
        title: cleanTitle,
        description: description.trim(),
        youtubeUrl: cleanUrl,
        youtubeVideoId: videoId,
        status,
        // Use local midday to avoid the date appearing one day earlier in some time zones.
        publishAt: new Date(`${publishAt}T12:00:00`),
        authorId: auth.currentUser?.uid || '',
      };

      if (editingId) {
        await updateInterview(editingId, data);
        setNotice('Interview updated.');
      } else {
        await createInterview(data);
        setNotice(status === 'published' ? 'Interview published.' : 'Interview saved as a draft.');
      }

      resetForm();
      setNotice(editingId ? 'Interview updated.' : (status === 'published' ? 'Interview published.' : 'Interview saved as a draft.'));
      await loadInterviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the interview.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(interview: Interview) {
    setError('');
    setNotice('');
    const nextStatus: InterviewStatus = interview.status === 'published' ? 'draft' : 'published';
    try {
      await setInterviewStatus(interview.id, nextStatus);
      setNotice(nextStatus === 'published' ? 'Interview published.' : 'Interview unpublished and saved as a draft.');
      await loadInterviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update interview status.');
    }
  }

  async function removeInterview(interview: Interview) {
    if (!window.confirm(`Delete “${interview.title}”? This cannot be undone.`)) return;
    setError('');
    setNotice('');
    try {
      await deleteInterview(interview.id);
      if (editingId === interview.id) resetForm();
      setNotice('Interview deleted.');
      await loadInterviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete interview.');
    }
  }

  const videoId = getYouTubeVideoId(youtubeUrl);

  return (
    <div className="w-full">
      <div className="border-b border-ink pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">Publication desk</p>
        <h1 className="mt-1 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">Interviews</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Add YouTube interviews to the public site. Videos stay on YouTube; UniVerse-City stores only the link and interview details.
        </p>
      </div>

      {error && <div role="alert" className="mt-5 border border-[#d9c8c8] bg-[#f7eeee] px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="mt-5 border border-[#b8cdb7] bg-[#f1f7f0] px-4 py-3 text-sm text-[#37613c]">{notice}</div>}

      <section className="border-b border-rule py-8">
        <div className="mb-5">
          <h2 className="font-serif text-2xl">{editingId ? 'Edit interview' : 'Add an interview'}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">Paste the YouTube link, then add the title, description and publication date.</p>
        </div>

        <form onSubmit={handleSave} className="grid gap-5">
          <label className="block text-xs text-muted">
            YouTube video link <span className="text-red-700">*</span>
            <input
              type="url"
              required
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="form-field mt-1"
            />
          </label>

          {videoId && (
            <div className="max-w-md">
              <p className="mb-2 text-xs font-semibold text-muted">Video preview</p>
              <div className="aspect-video overflow-hidden bg-[#eeece6]">
                <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="YouTube thumbnail preview" className="h-full w-full object-cover" />
              </div>
            </div>
          )}

          <label className="block text-xs text-muted">
            Interview title <span className="text-red-700">*</span>
            <input
              required
              maxLength={180}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Meet the students behind the project"
              className="form-field mt-1"
            />
          </label>

          <label className="block text-xs text-muted">
            Description
            <textarea
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Briefly introduce the guest and what viewers will learn."
              className="form-field mt-1"
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-xs text-muted">
              Publication date <span className="text-red-700">*</span>
              <input type="date" required value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="form-field mt-1" />
              <span className="mt-1 block text-[11px] leading-5">Future dates stay hidden until the date arrives.</span>
            </label>

            <fieldset className="min-w-0">
              <legend className="text-xs text-muted">Visibility</legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-1" role="radiogroup" aria-label="Interview visibility">
                <button
                  type="button"
                  role="radio"
                  aria-checked={status === 'draft'}
                  onClick={() => setStatus('draft')}
                  className={`flex min-h-12 w-full items-start gap-3 border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${status === 'draft' ? 'border-ink bg-[#f3f1eb]' : 'border-rule hover:bg-[#f8f7f3]'}`}
                >
                  <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${status === 'draft' ? 'border-ink' : 'border-[#999]'}`}>
                    {status === 'draft' && <span className="h-2 w-2 rounded-full bg-ink" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">Draft</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">Hidden from visitors.</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={status === 'published'}
                  onClick={() => setStatus('published')}
                  className={`flex min-h-12 w-full items-start gap-3 border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${status === 'published' ? 'border-[#7f9b7c] bg-[#f1f7f0]' : 'border-rule hover:bg-[#f8f7f3]'}`}
                >
                  <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${status === 'published' ? 'border-[#37613c]' : 'border-[#999]'}`}>
                    {status === 'published' && <span className="h-2 w-2 rounded-full bg-[#37613c]" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">Published</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">Visible to visitors on or after the publication date.</span>
                  </span>
                </button>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-2 border-t border-rule pt-5 sm:flex-row sm:gap-3">
            <button type="submit" disabled={saving} className="min-h-12 w-full border border-ink bg-ink px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#343832] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
              {saving ? 'Saving…' : editingId ? 'Save changes' : status === 'published' ? 'Publish interview' : 'Save draft'}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="min-h-12 w-full border border-rule px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-[#f3f1eb] sm:w-auto">Cancel editing</button>}
          </div>
        </form>
      </section>

      <section className="py-8">
        <div className="flex flex-col gap-2 border-b border-rule pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl">Saved interviews</h2>
            <p className="mt-1 text-xs text-muted">Manage drafts and published videos.</p>
          </div>
          <span className="text-xs text-muted">{interviews.length} {interviews.length === 1 ? 'interview' : 'interviews'}</span>
        </div>

        {loading ? (
          <p className="py-8 text-sm text-muted">Loading interviews…</p>
        ) : interviews.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-serif text-xl">No interviews added yet.</p>
            <p className="mt-2 text-sm text-muted">Your saved interviews will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-rule">
            {interviews.map((interview) => (
              <article key={interview.id} className="flex flex-col gap-4 py-5 sm:flex-row">
                <div className="aspect-video w-full shrink-0 overflow-hidden bg-[#eeece6] sm:w-48">
                  <img src={`https://i.ytimg.com/vi/${interview.youtubeVideoId}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">{statusLabel(interview.status)}<span className="text-xs text-muted">Date: {formatDate(interview.publishAt, { month: 'short', day: 'numeric', year: 'numeric' }, 'Not set')}</span></div>
                  <h3 className="mt-2 break-words font-serif text-xl leading-tight">{interview.title}</h3>
                  {interview.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{interview.description}</p>}
                  <p className="mt-2 break-all text-xs text-muted">{interview.youtubeUrl}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                    <button type="button" onClick={() => startEditing(interview)} className="min-h-11 border border-rule px-3 py-2 text-xs font-semibold hover:bg-[#f3f1eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Edit</button>
                    <button type="button" onClick={() => void toggleStatus(interview)} className="min-h-11 border border-rule px-3 py-2 text-xs font-semibold hover:bg-[#f3f1eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{interview.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                    {interview.status === 'published' && <a href={`/interviews/${interview.id}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center border border-rule px-3 py-2 text-xs font-semibold hover:bg-[#f3f1eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">View on site</a>}
                    <button type="button" onClick={() => void removeInterview(interview)} className="min-h-11 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
