import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { toDate } from '@/lib/date';
import type { Interview, InterviewStatus } from '@/lib/types';

const interviewsRef = collection(db, 'interviews');

/** Accept standard YouTube watch, short, shorts, embed, and live URLs only. */
export function getYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    let id: string | null = null;

    if (host === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        id = url.searchParams.get('v');
      } else {
        const parts = url.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) {
          id = parts[1] ?? null;
        }
      }
    }

    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isPublishedAndDue(interview: Interview): boolean {
  if (interview.status !== 'published') return false;
  const publishAt = toDate(interview.publishAt);
  return !publishAt || publishAt.getTime() <= Date.now();
}

export async function getPublishedInterviews(): Promise<Interview[]> {
  const q = query(
    interviewsRef,
    where('status', '==', 'published'),
    orderBy('publishAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() } as Interview))
    .filter(isPublishedAndDue);
}

export async function getPublishedInterviewById(id: string): Promise<Interview | null> {
  const snap = await getDoc(doc(db, 'interviews', id));
  if (!snap.exists()) return null;
  const interview = { id: snap.id, ...snap.data() } as Interview;
  return isPublishedAndDue(interview) ? interview : null;
}

export async function getAllInterviewsForAdmin(): Promise<Interview[]> {
  const q = query(interviewsRef, orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as Interview));
}

export async function createInterview(
  data: Omit<Interview, 'id' | 'createdAt' | 'updatedAt'>
) {
  return addDoc(interviewsRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateInterview(
  id: string,
  data: Partial<Omit<Interview, 'id' | 'createdAt'>>
) {
  return updateDoc(doc(db, 'interviews', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInterview(id: string) {
  return deleteDoc(doc(db, 'interviews', id));
}

export async function setInterviewStatus(id: string, status: InterviewStatus) {
  return updateInterview(id, { status });
}
