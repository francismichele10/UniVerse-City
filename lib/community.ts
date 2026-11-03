import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';

export const COMMUNITY_POST_LIMIT = 15;
export const COMMUNITY_POST_MAX_LENGTH = 280;

export interface CommunityPost {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL: string | null;
  createdAt: unknown;
  editedAt?: unknown;
  status: 'published' | 'hidden';
}

const postsRef = collection(db, 'communityPosts');

function mapPost(snapshot: QueryDocumentSnapshot<DocumentData>): CommunityPost {
  return { id: snapshot.id, ...snapshot.data() } as CommunityPost;
}

export async function getCommunityPosts(cursor?: QueryDocumentSnapshot<DocumentData> | null) {
  const constraints = [
    where('status', '==', 'published'),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(COMMUNITY_POST_LIMIT),
  ];

  const snapshot = await getDocs(query(postsRef, ...constraints));

  return {
    posts: snapshot.docs.map(mapPost),
    cursor: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null,
    hasMore: snapshot.docs.length === COMMUNITY_POST_LIMIT,
  };
}

export async function publishCommunityPost(data: {
  text: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL: string | null;
}) {
  const text = data.text.trim();

  if (!text || text.length > COMMUNITY_POST_MAX_LENGTH) {
    throw new Error('Your post must be between 1 and 280 characters.');
  }

  return addDoc(postsRef, {
    ...data,
    text,
    status: 'published',
    createdAt: serverTimestamp(),
  });
}

export async function removeCommunityPost(postId: string) {
  return deleteDoc(doc(db, 'communityPosts', postId));
}
