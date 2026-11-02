import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';

export type CommunityProfile = { uid: string; displayName: string; username: string; photoURL: string | null; verified: boolean; createdAt?: unknown; updatedAt?: unknown };

export function normalizeUsername(value: string) { return value.trim().replace(/^@/, '').toLowerCase(); }

export function validateProfile(displayName: string, username: string) {
  const name = displayName.trim();
  const handle = normalizeUsername(username);
  if (name.length < 2 || name.length > 60) throw new Error('Display name must be 2–60 characters.');
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) throw new Error('Username must be 3–20 characters using letters, numbers or underscores.');
  return { displayName: name, username: handle };
}

export async function getCommunityProfile(uid: string): Promise<CommunityProfile | null> {
  const snapshot = await getDoc(doc(db, 'communityProfiles', uid));
  return snapshot.exists() ? ({ uid, ...snapshot.data() } as CommunityProfile) : null;
}

export async function createCommunityProfile(uid: string, displayName: string, username: string, photoURL: string | null) {
  const values = validateProfile(displayName, username);
  const profileRef = doc(db, 'communityProfiles', uid);
  const usernameRef = doc(db, 'communityUsernames', values.username);
  await runTransaction(db, async (transaction) => {
    const profile = await transaction.get(profileRef);
    const reserved = await transaction.get(usernameRef);
    if (profile.exists()) throw new Error('Your community profile is already set up.');
    if (reserved.exists()) throw new Error('That username is already taken. Try another one.');
    transaction.set(usernameRef, { uid, username: values.username, createdAt: serverTimestamp() });
    transaction.set(profileRef, { uid, ...values, photoURL: photoURL || null, verified: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}
