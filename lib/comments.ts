import {
  collection, doc, getDocs, addDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, updateDoc, setDoc, getDoc,
} from 'firebase/firestore/lite';
import { db } from './firebase';
import type { Comment } from './types';

const commentsRef = collection(db, 'comments');

// Public: every comment on one post, oldest first (reads top to bottom like a thread)
export async function getCommentsForPost(postId: string): Promise<Comment[]> {
  const q = query(commentsRef, where('postId', '==', postId), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment));
}

// Signed-in readers only — enforced by firestore.rules, not just this function.
export async function addComment(data: {
  postId: string;
  postSlug: string;
  postTitle: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL: string | null;
  text: string;
  parentId?: string | null;
}) {
  return addDoc(commentsRef, { ...data, parentId: data.parentId || null, createdAt: serverTimestamp() });
}

// Used both by "delete my own comment" (reader) and admin moderation —
// firestore.rules is what actually decides who's allowed to call this on
// a given comment; this function itself doesn't check.
export async function deleteComment(id: string) {
  return deleteDoc(doc(db, 'comments', id));
}

// Admin: every comment across the whole site, newest first, for /admin/comments
export async function getAllCommentsForAdmin(): Promise<Comment[]> {
  const q = query(commentsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment));
}

export async function editComment(id: string, text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 1000) throw new Error('Comment must be between 1 and 1000 characters.');
  return updateDoc(doc(db, 'comments', id), { text: clean, editedAt: serverTimestamp() });
}

export async function toggleCommentLike(id: string, uid: string) {
  const likeRef = doc(db, 'comments', id, 'likes', uid);
  const existing = await getDoc(likeRef);
  if (existing.exists()) return deleteDoc(likeRef);
  return setDoc(likeRef, { uid, createdAt: serverTimestamp() });
}

export async function getCommentLikeState(id: string, uid: string) {
  const snap = await getDoc(doc(db, 'comments', id, 'likes', uid));
  return snap.exists();
}
