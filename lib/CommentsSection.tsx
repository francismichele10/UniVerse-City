'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { getCommentsForPost, addComment, deleteComment, editComment, toggleCommentLike, getCommentLikeState } from '@/lib/comments';
import { signInReader, watchReaderAuth } from '@/lib/readerAuth';
import { formatRelativeTime } from '@/lib/date';
import type { Comment } from '@/lib/types';

function initialsFor(name: string) { return name.trim().slice(0, 2).toUpperCase() || '?'; }

export function Comments({ postId, postSlug, postTitle }: { postId: string; postSlug: string; postTitle: string }) {
  const [comments,setComments]=useState<Comment[]>([]);
  const [loading,setLoading]=useState(true);
  const [user,setUser]=useState<User|null>(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [text,setText]=useState('');
  const [replyTo,setReplyTo]=useState<string|null>(null);
  const [posting,setPosting]=useState(false);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editText,setEditText]=useState('');
  const [likedIds,setLikedIds]=useState<string[]>([]);
  const [error,setError]=useState('');

  async function refresh(){setComments(await getCommentsForPost(postId));}
  useEffect(()=>{const unsub=watchReaderAuth(u=>{setUser(u);setAuthChecked(true);});return()=>unsub();},[]);
  useEffect(()=>{let active=true;setLoading(true);getCommentsForPost(postId).then(rows=>{if(active)setComments(rows);}).catch(()=>{if(active)setError('Comments could not be loaded. Please refresh and try again.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[postId]);
  useEffect(()=>{let active=true;if(user){Promise.all(comments.map(async c=>await getCommentLikeState(c.id,user.uid)?c.id:null)).then(ids=>{if(active)setLikedIds(ids.filter((id):id is string=>Boolean(id)));}).catch(()=>{});}else setLikedIds([]);return()=>{active=false;};},[comments,user]);

  async function handlePost(){
    if(!user||!text.trim())return;setPosting(true);setError('');
    try{await addComment({postId,postSlug,postTitle,authorUid:user.uid,authorName:user.displayName||user.email||'Reader',authorPhotoURL:user.photoURL||null,text:text.trim(),parentId:replyTo});setText('');setReplyTo(null);await refresh();}
    catch(err){const code=(err as {code?:string})?.code;setError(code==='permission-denied'?'Your account currently has a commenting restriction. Please contact the UniVerse-City team if this is unexpected.':'Could not post your comment. Please try again.');}
    finally{setPosting(false);}
  }
  async function handleDelete(id:string){if(!confirm('Delete this comment?'))return;setDeletingId(id);try{await deleteComment(id);await refresh();}catch{setError('Could not delete that comment.');}finally{setDeletingId(null);}}
  async function handleLike(id:string){if(!user){await signInReader();return;}const old=likedIds.includes(id);setLikedIds(ids=>old?ids.filter(x=>x!==id):[...ids,id]);try{await toggleCommentLike(id,user.uid);}catch{setLikedIds(ids=>old?[...ids,id]:ids.filter(x=>x!==id));setError('Could not update your like.');}}
  async function saveEdit(id:string){try{await editComment(id,editText);setEditingId(null);setEditText('');await refresh();}catch{setError('Could not save your edit.');}}

  const roots=useMemo(()=>comments.filter(c=>!c.parentId||!comments.some(p=>p.id===c.parentId)),[comments]);
  const children=(id:string)=>comments.filter(c=>c.parentId===id);
  function renderComment(c:Comment,depth=0):React.ReactNode{
    return <div key={c.id} className={depth?'ml-7 mt-4 border-l-2 border-[#e8e0d3] pl-4':''}>
      <div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-raised text-xs font-semibold text-navy">{initialsFor(c.authorName)}</div><div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-ink">{c.authorName}</span><span className="text-xs text-muted">{formatRelativeTime(c.createdAt)}{c.editedAt?' · edited':''}</span></div>
        {editingId===c.id?<div className="mt-2"><textarea value={editText} onChange={e=>setEditText(e.target.value)} maxLength={1000} rows={3} className="w-full rounded border border-rule bg-paper-raised p-2 text-sm"/><div className="mt-2 flex gap-3"><button onClick={()=>void saveEdit(c.id)} className="text-xs font-semibold underline">Save edit</button><button onClick={()=>setEditingId(null)} className="text-xs text-muted">Cancel</button></div></div>:<p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#2b2f2c]">{c.text}</p>}
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted"><button onClick={()=>void handleLike(c.id)} className={likedIds.includes(c.id)?'font-semibold text-[#a34f54]':''}>{likedIds.includes(c.id)?'♥ Liked':'♡ Like'}</button>{depth<2&&<button onClick={()=>{setReplyTo(c.id);setText('');}} className="hover:text-ink">Reply</button>}{user?.uid===c.authorUid&&<button onClick={()=>{setEditingId(c.id);setEditText(c.text);}} className="hover:text-ink">Edit</button>}{user?.uid===c.authorUid&&<button onClick={()=>void handleDelete(c.id)} disabled={deletingId===c.id} className="text-red-700 disabled:opacity-50">{deletingId===c.id?'Deleting…':'Delete'}</button>}</div>
      </div></div>
      {children(c.id).map(child=>renderComment(child,depth+1))}
    </div>;
  }

  return <div className="mt-8 border-t border-rule pt-6">
    <h2 className="mb-4 font-serif text-lg text-ink">Comments {comments.length>0&&<span className="ml-1.5 font-sans text-sm font-normal text-muted">({comments.length})</span>}</h2>
    {loading?<p className="text-sm text-muted">Loading comments…</p>:<div className="mb-5 space-y-5">{roots.map(c=>renderComment(c))}{comments.length===0&&<p className="text-sm text-muted">No comments yet — be the first.</p>}</div>}
    {error&&<p role="alert" className="mb-3 text-xs text-red-700">{error}</p>}
    {!authChecked?null:user?<div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-raised text-xs font-semibold text-navy">{initialsFor(user.displayName||user.email||'?')}</div><div className="flex-1">{replyTo&&<div className="mb-2 flex items-center justify-between text-xs text-muted"><span>Replying to {comments.find(c=>c.id===replyTo)?.authorName||'comment'}</span><button onClick={()=>setReplyTo(null)}>Cancel reply</button></div>}<textarea value={text} onChange={e=>setText(e.target.value)} placeholder={replyTo?'Write a reply…':'Add a comment…'} rows={2} maxLength={1000} className="w-full rounded-sm border border-rule bg-paper-raised px-3 py-2 text-sm"/><div className="mt-1.5 text-right"><button onClick={()=>void handlePost()} disabled={posting||!text.trim()} className="border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-paper disabled:opacity-50">{posting?'Posting…':replyTo?'Reply':'Post'}</button></div></div></div>:<div className="rounded-sm border border-rule bg-paper-raised p-4 text-center"><p className="mb-2.5 text-sm text-muted">Sign in to join the conversation</p><button onClick={()=>void signInReader()} className="border border-ink bg-ink px-4 py-2 text-xs font-semibold text-paper">Sign in with Google</button></div>}
  </div>;
}
