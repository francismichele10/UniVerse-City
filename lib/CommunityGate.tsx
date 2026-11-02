'use client';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { watchReaderAuth } from '@/lib/readerAuth';
import { getCommunityProfile, refreshCommunityPhoto, type CommunityProfile } from '@/lib/communityProfiles';
import { CommunityProfileSetup } from '@/lib/CommunityProfileSetup';
import { CommunityFeed } from '@/lib/CommunityFeed';

export function CommunityGate() {
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<CommunityProfile|null>(null);
 const [checked,setChecked]=useState(false);
 const [welcome,setWelcome]=useState(false);
 useEffect(()=>watchReaderAuth(u=>{setUser(u);if(!u){setProfile(null);setChecked(true);return;}setChecked(false);refreshCommunityPhoto(u.uid,u.photoURL).then(setProfile).catch(()=>getCommunityProfile(u.uid).then(setProfile).catch(()=>setProfile(null))).finally(()=>setChecked(true));}),[]);
 async function refresh(){if(user){const p=await getCommunityProfile(user.uid);setProfile(p);if(p){setWelcome(true);window.setTimeout(()=>setWelcome(false),2600);}}}
 if(!checked)return <div className="mx-auto max-w-3xl px-5 py-8 text-sm text-muted">Checking your Community profile…</div>;
 if(user&&!profile)return <div className="mx-auto max-w-3xl px-5 py-8"><CommunityProfileSetup uid={user.uid} displayName={user.displayName||''} photoURL={user.photoURL} onComplete={()=>void refresh()}/></div>;
 return <><CommunityFeed/>{welcome&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f8f3e8]/95 px-6 text-center"><div className="rounded-2xl border border-[#c9ad7d] bg-[#fffdf8] px-8 py-10 shadow-xl animate-[welcomeFade_2.6s_ease-in-out_forwards]"><p className="font-serif text-3xl leading-tight text-[#4b3925] sm:text-4xl">Welcome to UniVerse-City Community<span className="inline-block animate-bounce">!</span></p><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b7849]">Your conversation starts here</p></div></div>}</>;
}
