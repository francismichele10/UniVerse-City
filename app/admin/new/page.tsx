'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { EmojiStyle, type EmojiClickData } from 'emoji-picker-react';

import {
  UnderlineMark,
  LinkMark,
  AutoLinkMark,
  HashtagMark,
  LineSpacing,
} from '@/lib/tiptapFormatting';

import { auth } from '@/lib/firebaseAuth';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import {
  createPost,
  updatePost,
  getPostById,
} from '@/lib/posts';
import { getSettings } from '@/lib/settings';
import { toDate } from '@/lib/date';
import type { ArticlePoll, PostStatus } from '@/lib/types';
import { ArticlePollNode } from '@/lib/ArticlePollNode';

const EmojiPicker = dynamic(
  () => import('emoji-picker-react'),
  {
    ssr: false,
  }
);

// Formats a Date for an <input type="datetime-local"> value.
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) =>
    String(n).padStart(2, '0');

  return `${d.getFullYear()}-${pad(
    d.getMonth() + 1
  )}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// useSearchParams() requires a Suspense boundary in the app router.
export default function NewPostPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted">
          Loading…
        </p>
      }
    >
      <NewPostForm />
    </Suspense>
  );
}

function NewPostForm() {
  const searchParams = useSearchParams();
  const editingId = searchParams.get('id');
  const router = useRouter();

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineMark,
      LinkMark,
      AutoLinkMark,
      HashtagMark,
      LineSpacing,
      ArticlePollNode,
    ],
    content: '',
    immediatelyRender: false,
  });

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [tags, setTags] = useState('');
  const [coverFile, setCoverFile] =
    useState<File | null>(null);
  const [existingCoverUrl, setExistingCoverUrl] =
    useState<string | null>(null);
  const [status, setStatus] =
    useState<PostStatus>('draft');
  const [publishAt, setPublishAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingPost, setLoadingPost] =
    useState(!!editingId);
  const [emojiPickerOpen, setEmojiPickerOpen] =
    useState(false);

  const [lineSpacing, setLineSpacing] = useState('1.6');
  const [poll, setPoll] = useState<ArticlePoll | null>(null);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Categories still come from Settings.
  useEffect(() => {
    getSettings().then((s) => {
      setCategories(s.categories);

      if (!editingId) {
        setCategory(s.categories[0] ?? '');
      }
    });
  }, [editingId]);

  // Load an existing post when editing.
  useEffect(() => {
    if (!editingId || !editor) return;

    let cancelled = false;

    getPostById(editingId).then((post) => {
      if (cancelled || !post) return;

      setTitle(post.title);
      const savedPoll = post.polls ? Object.values(post.polls)[0] : null;
      if (savedPoll) {
        setPoll(savedPoll);
        setPollQuestion(savedPoll.question);
        setPollOptions(savedPoll.options.map((option) => option.text));
      }
      setExcerpt(post.excerpt);
      setCategory(post.category);
      setAuthorName(post.authorName ?? '');
      setTags(post.tags.join(', '));
      setExistingCoverUrl(post.coverImageUrl);
      setStatus(post.status);

      const d = toDate(post.publishAt);

      setPublishAt(
        d ? toDatetimeLocalValue(d) : ''
      );

      editor.commands.setContent(
        post.body || ''
      );

      setLoadingPost(false);
    });

    return () => {
      cancelled = true;
    };
  }, [editingId, editor]);

  function slugify(text: string) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  async function notifyRevalidate(cat: string) {
    fetch('/api/revalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: cat,
      }),
    }).catch(() => {});
  }

  /**
   * Safety-net conversion for hashtags.
   *
   * HashtagMark now creates a real Tiptap mark,
   * so hashtags should already be present in
   * editor.getHTML().
   *
   * This function also catches any plain hashtags
   * that somehow remain unmarked before saving.
   */
  function prepareBodyForSaving(
    html: string
  ): string {
    if (!html) return html;

    const parser = new DOMParser();

    const parsedDocument =
      parser.parseFromString(
        html,
        'text/html'
      );

    const hashtagPattern =
      /#[\p{L}\p{N}_-]+/gu;

    const walker =
      parsedDocument.createTreeWalker(
        parsedDocument.body,
        NodeFilter.SHOW_TEXT
      );

    const textNodes: Text[] = [];

    let currentNode = walker.nextNode();

    while (currentNode) {
      const textNode =
        currentNode as Text;

      const parent =
        textNode.parentElement;

      if (
        parent &&
        parent.tagName !== 'A' &&
        parent.tagName !== 'SCRIPT' &&
        parent.tagName !== 'STYLE' &&
        !parent.hasAttribute(
          'data-hashtag'
        ) &&
        !parent.classList.contains(
          'hashtag-blue'
        )
      ) {
        textNodes.push(textNode);
      }

      currentNode = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const text =
        textNode.nodeValue ?? '';

      hashtagPattern.lastIndex = 0;

      const matches =
        [...text.matchAll(
          hashtagPattern
        )];

      if (matches.length === 0) {
        continue;
      }

      const fragment =
        parsedDocument.createDocumentFragment();

      let lastIndex = 0;

      for (const match of matches) {
        const hashtag = match[0];
        const index =
          match.index ?? 0;

        if (index > lastIndex) {
          fragment.appendChild(
            parsedDocument.createTextNode(
              text.slice(
                lastIndex,
                index
              )
            )
          );
        }

        const span =
          parsedDocument.createElement(
            'span'
          );

        span.className =
          'hashtag-blue';

        span.setAttribute(
          'data-hashtag',
          'true'
        );

        span.setAttribute(
          'style',
          'color:#2563eb;text-decoration:none;'
        );

        span.textContent = hashtag;

        fragment.appendChild(span);

        lastIndex =
          index + hashtag.length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(
          parsedDocument.createTextNode(
            text.slice(lastIndex)
          )
        );
      }

      textNode.parentNode?.replaceChild(
        fragment,
        textNode
      );
    }

    return (
      parsedDocument.body.innerHTML
    );
  }

  async function handleSave() {
    setSaving(true);

    try {
      let coverImageUrl:
        | string
        | null =
        existingCoverUrl;

      if (coverFile) {
        coverImageUrl =
          await uploadImageToCloudinary(
            coverFile
          );
      }

      const editorHTML =
        editor?.getHTML() ?? '';

      const preparedBody =
        prepareBodyForSaving(
          editorHTML
        );

      const finalPoll = poll ? (() => {
        const options = pollOptions.map((text, index) => ({ id: poll.options[index]?.id ?? crypto.randomUUID(), text: text.trim() })).filter((option) => option.text);
        return { ...poll, question: pollQuestion.trim(), options, optionIds: options.map((option) => option.id) };
      })() : null;

      const payload = {
        title,
        slug: slugify(title),
        excerpt,
        body: preparedBody,
        polls: finalPoll ? { [finalPoll.id]: finalPoll } : {},
        coverImageUrl,
        category,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status,
        publishAt: publishAt
          ? new Date(publishAt)
          : new Date(),
        authorId:
          auth.currentUser?.uid ?? '',
        authorName,
      };

      if (editingId) {
        await updatePost(
          editingId,
          payload as any
        );
      } else {
        await createPost(
          payload as any
        );
      }

      if (status === 'published') {
        await notifyRevalidate(
          category
        );
      }

      router.push('/admin');
    } finally {
      setSaving(false);
    }
  }

  if (loadingPost) {
    return (
      <p className="text-sm text-muted">
        Loading post…
      </p>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">
        {editingId
          ? 'Edit Post'
          : 'New Post'}
      </h1>

      <input
        placeholder="Title"
        value={title}
        onChange={(e) =>
          setTitle(e.target.value)
        }
        className="form-field"
      />

      <input
        placeholder="Short excerpt for cards / SEO"
        value={excerpt}
        onChange={(e) =>
          setExcerpt(e.target.value)
        }
        className="form-field"
      />

      <div>
        <label className="mb-1 block text-xs text-muted">
          Body
        </label>

        <div className="overflow-hidden rounded-sm border border-rule bg-white">
          <div className="relative flex flex-wrap items-center gap-1 border-b border-rule bg-white p-2">
            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleBold()
                  .run()
              }
              className={`rounded px-2 py-1 text-sm ${
                editor?.isActive('bold')
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
              title="Bold"
            >
              <b>B</b>
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleItalic()
                  .run()
              }
              className={`rounded px-2 py-1 text-sm ${
                editor?.isActive('italic')
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
              title="Italic"
            >
              <i>I</i>
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleMark(
                    'underline'
                  )
                  .run()
              }
              className={`rounded px-2 py-1 text-sm ${
                editor?.isActive(
                  'underline'
                )
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
              title="Underline"
            >
              <u>U</u>
            </button>

            <span className="mx-1 h-5 w-px bg-rule" />

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleHeading({
                    level: 2,
                  })
                  .run()
              }
              className={`rounded px-2 py-1 text-xs font-semibold ${
                editor?.isActive(
                  'heading',
                  { level: 2 }
                )
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
            >
              H2
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleHeading({
                    level: 3,
                  })
                  .run()
              }
              className={`rounded px-2 py-1 text-xs font-semibold ${
                editor?.isActive(
                  'heading',
                  { level: 3 }
                )
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
            >
              H3
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleBulletList()
                  .run()
              }
              className={`rounded px-2 py-1 text-sm ${
                editor?.isActive(
                  'bulletList'
                )
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
              title="Bulleted list"
            >
              • List
            </button>

            <button
              type="button"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleOrderedList()
                  .run()
              }
              className={`rounded px-2 py-1 text-sm ${
                editor?.isActive(
                  'orderedList'
                )
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
              title="Numbered list"
            >
              1. List
            </button>

            <span className="mx-1 h-5 w-px bg-rule" />

            <label className="flex items-center gap-1 px-1 text-xs text-muted">
              <span className="sr-only">Line spacing</span>
              <select
                value={lineSpacing}
                onChange={(e) => {
                  const nextSpacing = e.target.value;
                  setLineSpacing(nextSpacing);

                  editor
                    ?.chain()
                    .focus()
                    .updateAttributes('paragraph', {
                      lineHeight: nextSpacing,
                    })
                    .run();
                }}
                className="border border-rule bg-white px-2 py-1 text-xs text-ink outline-none focus:border-brass"
                title="Line spacing"
                aria-label="Line spacing"
              >
                <option value="1.2">Single</option>
                <option value="1.5">1.5 lines</option>
                <option value="1.6">Normal</option>
                <option value="1.8">Relaxed</option>
                <option value="2">Double</option>
              </select>
            </label>

            <span className="mx-1 h-5 w-px bg-rule" />

            <button
              type="button"
              onClick={() =>
                setEmojiPickerOpen(
                  (value) => !value
                )
              }
              className={`rounded px-2 py-1 text-base ${
                emojiPickerOpen
                  ? 'bg-ink text-paper'
                  : 'hover:bg-[#f3f3f1]'
              }`}
              title="Emoji"
              aria-label="Open emoji picker"
            >
              😊
            </button>

            {emojiPickerOpen && (
              <div
                className="
                  absolute
                  left-1/2
                  top-full
                  z-40
                  mt-2
                  -translate-x-1/2
                  sm:left-2
                  sm:translate-x-0
                "
              >
                <div className="max-w-[calc(100vw-24px)] overflow-hidden rounded-sm shadow-lg">
                  <EmojiPicker
                    onEmojiClick={(
                      emojiData: EmojiClickData
                    ) => {
                      editor
                        ?.chain()
                        .focus()
                        .insertContent(
                          emojiData.emoji
                        )
                        .run();

                      setEmojiPickerOpen(
                        false
                      );
                    }}
                    previewConfig={{
                      showPreview:
                        false,
                    }}
                    width="100%"
                    height={400}
                    emojiStyle={
                      EmojiStyle.NATIVE
                    }
                    lazyLoadEmojis
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className="min-h-[240px] overflow-x-auto px-3 py-3 text-sm [&_.tiptap]:min-h-[220px] [&_.tiptap]:outline-none [&_.tiptap_p]:mb-3 [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:mt-4 [&_.tiptap_h2]:font-serif [&_.tiptap_h2]:text-xl [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:mt-3 [&_.tiptap_h3]:font-serif [&_.tiptap_h3]:text-lg [&_.tiptap_ul]:mb-3 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ol]:mb-3 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5"
            style={{ lineHeight: lineSpacing }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        <p className="mt-1 text-[11px] text-muted">
          Use the line-spacing selector above the editor to adjust
          the spacing between lines. Hashtags such as #ManCity
          appear blue but are not
          clickable. Website addresses
          such as meta.ai become
          clickable automatically. Tap
          😊 to open the full emoji
          picker with search, categories
          and skin tones.
        </p>
      </div>

      <div className="rounded-sm border border-rule bg-[#faf9f6] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Article poll</h2>
            <p className="mt-1 text-xs text-muted">Add a WhatsApp-style poll anywhere in this article.</p>
          </div>
          {!poll && (
            <button type="button" onClick={() => {
              const id = crypto.randomUUID();
              const nextPoll: ArticlePoll = { id, question: '', options: [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }], optionIds: [] };
              setPoll(nextPoll);
              editor?.chain().focus().insertContent({ type: 'articlePoll', attrs: { pollId: id } }).run();
            }} className="border border-ink bg-ink px-3 py-2 text-xs font-medium text-paper">＋ Add poll</button>
          )}
        </div>
        {poll && (
          <div className="space-y-3">
            <input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} maxLength={180} placeholder="Ask a question…" className="form-field" />
            {pollOptions.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input value={option} onChange={(event) => setPollOptions((current) => current.map((value, item) => item === index ? event.target.value : value))} maxLength={80} placeholder={`Option ${index + 1}`} className="form-field" />
                {pollOptions.length > 2 && <button type="button" onClick={() => setPollOptions((current) => current.filter((_, item) => item !== index))} className="px-2 text-sm text-red-700" aria-label="Remove option">×</button>}
              </div>
            ))}
            {pollOptions.length < 6 && <button type="button" onClick={() => setPollOptions((current) => [...current, ''])} className="text-xs font-medium text-[#80683d]">＋ Add option</button>}
            <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
              <p className="text-[11px] text-muted">Readers can change their vote. Maximum 6 options.</p>
              <button type="button" onClick={() => { editor?.commands.command(({ tr, state }) => { const positions: number[] = []; state.doc.descendants((node, position) => { if (node.type.name === 'articlePoll') positions.push(position); }); positions.reverse().forEach((position) => tr.delete(position, position + 1)); return true; }); setPoll(null); setPollQuestion(''); setPollOptions(['', '']); }} className="text-xs text-red-700">Remove poll</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value)
          }
          className="form-field sm:flex-1"
        >
          {categories.map((c) => (
            <option
              key={c}
              value={c}
            >
              {c}
            </option>
          ))}
        </select>

        <input
          placeholder="Tags (comma separated)"
          value={tags}
          onChange={(e) =>
            setTags(e.target.value)
          }
          className="form-field sm:flex-1"
        />
      </div>

      <div>
        <label className="block text-xs text-muted">
          Cover image
        </label>

        {existingCoverUrl &&
          !coverFile && (
            <div className="my-2 flex h-28 w-28 items-center justify-center overflow-hidden rounded-sm bg-[#F5F4F0]">
              <img
                src={existingCoverUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
          )}

        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setCoverFile(
              e.target.files?.[0] ??
                null
            )
          }
          className="text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-muted">
          Byline (author name)
        </label>

        <input
          placeholder="Your name, shown under the headline"
          value={authorName}
          onChange={(e) =>
            setAuthorName(
              e.target.value
            )
          }
          className="form-field"
        />
      </div>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <select
          value={status}
          onChange={(e) =>
            setStatus(
              e.target.value as PostStatus
            )
          }
          className="form-field"
        >
          <option value="draft">
            Draft
          </option>
          <option value="scheduled">
            Scheduled
          </option>
          <option value="published">
            Published
          </option>
        </select>

        {status === 'scheduled' && (
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) =>
              setPublishAt(
                e.target.value
              )
            }
            className="form-field"
          />
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={
          saving ||
          !title ||
          !authorName
        }
        className="w-full border border-ink bg-ink px-4 py-3 text-sm font-medium text-paper hover:bg-[#343934] disabled:opacity-50 sm:w-auto sm:py-2"
      >
        {saving
          ? 'Saving…'
          : 'Save Post'}
      </button>
    </div>
  );
}