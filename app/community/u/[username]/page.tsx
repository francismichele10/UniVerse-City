import type { Metadata } from 'next';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { VerificationBadge } from '@/lib/VerificationBadge';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ username: string }> };
type StudentProfile = { uid: string; displayName: string; username: string; photoURL: string | null; verified: boolean };

async function findProfile(username: string): Promise<StudentProfile | null> {
  const key = username.toLowerCase();
  const reservation = await getDoc(doc(db, 'communityUsernames', key));
  if (!reservation.exists()) return null;
  const uid = String(reservation.data().uid || '');
  if (!uid) return null;
  const profile = await getDoc(doc(db, 'communityProfiles', uid));
  return profile.exists() ? ({ uid, ...profile.data() } as StudentProfile) : null;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await findProfile(username);
  return { title: profile ? `${profile.displayName} (@${profile.username}) · Community` : 'Student profile · Community' };
}
export default async function StudentProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = await findProfile(username);
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-16"><h1 className="font-serif text-3xl text-ink">Profile not found</h1><p className="mt-2 text-sm text-muted">This username may not exist.</p><Link href="/community" className="mt-5 inline-block text-sm underline">Back to Community</Link></main>;
  return <main className="mx-auto max-w-3xl px-5 py-12"><Link href="/community" className="text-xs text-muted underline">← Back to Community</Link><section className="mt-6 rounded-2xl border border-rule bg-white p-7"><div className="flex items-center gap-4">{profile.photoURL?<img src={String(profile.photoURL)} alt="" className="h-20 w-20 rounded-full object-cover"/>:<div className="h-20 w-20 rounded-full bg-[#eee8dc]"/>}<div><h1 className="flex items-center gap-2 font-serif text-3xl text-ink">{String(profile.displayName)}{profile.verified===true&&<VerificationBadge className="h-5 w-5"/>}</h1><p className="mt-1 text-sm text-muted">@{String(profile.username)}</p></div></div><p className="mt-7 border-t border-rule pt-5 text-xs text-muted">UniVerse-City Community member</p></section></main>;
}
