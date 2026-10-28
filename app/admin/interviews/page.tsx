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
import { formatDate } from '@/lib/date';
import type { Interview, InterviewStatus } from '@/lib/types';

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
  const [shortDescription, setShortDescription] = useState('');

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
    void loadInterviews();
  }, [loadInterviews]);

  function resetForm() {
    setEditingId(null);
    setYoutubeUrl('');
    setTitle('');
    setDescription('');
    setShortDescription('');
    setError('');
    setNotice('');
  }

  function startEditing(interview: Interview) {
    setEditingId(interview.id);
    setYoutubeUrl(interview.youtubeUrl);
    setTitle(interview.title);
    setDescription(interview.description || '');
    setShortDescription(interview.shortDescription || '');
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
    setSaving(true);
    try {
      const data = {
        title: cleanTitle,
        description: description.trim(),
        shortDescription: shortDescription.trim(),
        youtubeUrl: cleanUrl,
        youtubeVideoId: videoId,
        status: 'published' as const,
        // Publish immediately; there is no draft or scheduled-publication step.
        publishAt: new Date(),
        authorId: auth.currentUser?.uid || '',
      };

      const wasEditing = Boolean(editingId);
      if (editingId) {
        await updateInterview(editingId, data);
      } else {
        await createInterview(data);
      }

      resetForm();
      setNotice(wasEditing ? 'Interview updated and published.' : 'Interview published.');
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
          <p className="mt-1 text-xs leading-5 text-muted">Paste the YouTube link, add the title and description, then publish immediately. You can edit it later if needed.</p>
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
            Short preview <span className="text-muted">(shown on the public Interviews tab)</span>
            <textarea
              rows={2}
              maxLength={240}
              value={shortDescription}
              onChange={(event) => setShortDescription(event.target.value)}
              placeholder="Write a concise teaser that makes people want to watch."
              className="form-field mt-1"
            />
            <span className="mt-1 block text-[11px] text-muted">{shortDescription.length}/240 characters. This wording is separate from the full description.</span>
          </label>

          <label className="block text-xs text-muted">
            Full description <span className="text-muted">(shown below the video)</span>
            <textarea
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Introduce the guest and explain what viewers will learn."
              className="form-field mt-1"
            />
          </label>

          <div className="flex flex-col gap-3 border-t border-rule pt-5 sm:flex-row">
            <button type="submit" disabled={saving} className="border border-ink bg-ink px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#343832] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Publishing…' : editingId ? 'Save changes & publish' : 'Publish interview'}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="border border-rule px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-[#f3f1eb]">Cancel editing</button>}
          </div>
        </form>
      </section>

      <section className="py-8">
        <div className="flex flex-col gap-2 border-b border-rule pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl">Saved interviews</h2>
            <p className="mt-1 text-xs text-muted">Manage published interviews. Edit any interview and save your changes immediately.</p>
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
                  {(interview.shortDescription || interview.description) && <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{interview.shortDescription || interview.description}</p>}
                  <p className="mt-2 break-all text-xs text-muted">{interview.youtubeUrl}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <button type="button" onClick={() => startEditing(interview)} className="editorial-link">Edit</button>
                    <button type="button" onClick={() => void toggleStatus(interview)} className="editorial-link">{interview.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                    {interview.status === 'published' && <a href={`/interviews/${interview.id}`} className="editorial-link">View on site</a>}
                    <button type="button" onClick={() => void removeInterview(interview)} className="text-red-700 underline underline-offset-2">Delete</button>
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
