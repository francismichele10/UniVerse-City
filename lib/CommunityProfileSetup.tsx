'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { createCommunityProfile } from '@/lib/communityProfiles';

export function CommunityProfileSetup({ uid, displayName, photoURL, onComplete }: { uid: string; displayName: string; photoURL: string | null; onComplete: () => void }) {
 const [name,setName]=useState(displayName);
 const [username,setUsername]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{await createCommunityProfile(uid,name,username,photoURL);onComplete();}catch(e){setError(e instanceof Error?e.message:'Could not create profile.');}finally{setBusy(false);}}
 return <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-rule bg-white p-5 sm:grid-cols-2">
  <div className="flex items-center gap-3 sm:col-span-2">{photoURL?<img src={photoURL} alt="Your Google profile" className="h-14 w-14 rounded-full border border-rule object-cover"/>:<div className="h-14 w-14 rounded-full bg-[#eee8dc]"/>}<div><h3 className="font-serif text-xl text-ink">Set up your Community profile</h3><p className="mt-1 text-xs text-muted">Your Google photo will be used as your profile picture.</p></div></div>
  <label className="text-xs font-semibold text-ink">Display name<input required minLength={2} maxLength={60} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded border border-rule bg-paper-raised p-2 text-sm font-normal"/></label>
  <label className="text-xs font-semibold text-ink">Unique username<input required minLength={3} maxLength={20} pattern="[a-z0-9_]{3,20}" value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="e.g. francis_adu" className="mt-1 w-full rounded border border-rule bg-paper-raised p-2 text-sm font-normal"/><span className="mt-1 block text-[10px] font-normal text-muted">3–20 letters, numbers or underscores. Usernames are unique.</span></label>
  {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
  <button disabled={busy} className="rounded bg-[#8b6536] px-4 py-2 text-white disabled:opacity-50 sm:col-span-2">{busy?'Saving…':'Create profile'}</button>
 </form>;
}
