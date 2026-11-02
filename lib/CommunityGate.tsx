'use client';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInReader, watchReaderAuth } from '@/lib/readerAuth';
import { getCommunityProfile, type CommunityProfile } from '@/lib/communityProfiles';
import { CommunityProfileSetup } from '@/lib/CommunityProfileSetup';
import { CommunityFeed } from '@/lib/CommunityFeed';

export function CommunityGate() {
 const [user,setUser]=useState<User|null>(null); const [profile,setProfile]=useState<CommunityProfile|null>(null); const [checked,setChecked]=useState(false); const [busy,setBusy]=useState(false);
 useEffect(()=>watchReaderAuth(u=>{setUser(u);if(!u){setProfile(null);setChecked(true);return;}setChecked(false);getCommunityProfile(u.uid).then(setProfile).catch(()=>setProfile(null)).finally(()=>setChecked(true));}),[]);
 async function refresh(){if(user){const p=await getCommunityProfile(user.uid);setProfile(p);}}
 if(!checked)return <div className="mx-auto max-w-3xl px-5 py-8 text-sm text-muted">Checking your Community profile…</div>;
 if(user&&!profile)return <div className="mx-auto max-w-3xl px-5 py-8"><CommunityProfileSetup uid={user.uid} displayName={user.displayName||''} photoURL={user.photoURL} onComplete={()=>void refresh()}/></div>;
 if(!user)return <div><CommunityFeed/><div className="mx-auto max-w-6xl px-5 pb-8 text-center"><button disabled={busy} onClick={()=>{setBusy(true);void signInReader().finally(()=>setBusy(false));}} className="rounded-lg bg-[#8b6536] px-5 py-3 text-xs font-semibold text-white">{busy?'Opening Google…':'Sign in to create your Community profile'}</button></div></div>;
 return <CommunityFeed/>;
}
