'use client';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { watchReaderAuth } from '@/lib/readerAuth';
import { getCommunityProfile, refreshCommunityPhoto, type CommunityProfile } from '@/lib/communityProfiles';
import { CommunityProfileSetup } from '@/lib/CommunityProfileSetup';
import { CommunityFeed } from '@/lib/CommunityFeed';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import type { Timestamp } from 'firebase/firestore/lite';

type Restriction = { reason: string; mode: 'full' | 'post' | 'comment'; active: boolean; expiresAt: Timestamp | null };
type Appeal = { status: 'pending' | 'approved' | 'rejected'; message: string; createdAt?: Timestamp; decisionNote?: string };
function activeRestriction(item: Restriction | null) {
  return Boolean(item?.active && (!item.expiresAt || item.expiresAt.toDate().getTime() > Date.now()));
}

export function CommunityGate() {
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<CommunityProfile|null>(null);
 const [checked,setChecked]=useState(false);
 const [welcome,setWelcome]=useState(false);
 const [restriction,setRestriction]=useState<Restriction|null>(null);
 const [appeal,setAppeal]=useState<Appeal|null>(null);
 const [appealText,setAppealText]=useState('');
 const [submitting,setSubmitting]=useState(false);
 const [appealError,setAppealError]=useState('');
 const [restrictionChecked,setRestrictionChecked]=useState(false);

 useEffect(()=>watchReaderAuth(u=>{
   setUser(u); setRestriction(null); setAppeal(null); setRestrictionChecked(!u);
   if(!u){setProfile(null);setChecked(true);return;}
   setChecked(false);
   Promise.all([
     refreshCommunityPhoto(u.uid,u.photoURL).catch(()=>getCommunityProfile(u.uid).catch(()=>null)),
     getDoc(doc(db,'accountRestrictions',u.uid)).then(s=>s.exists()?s.data() as Restriction:null).catch(()=>null),
     getDoc(doc(db,'restrictionAppeals',u.uid)).then(s=>s.exists()?s.data() as Appeal:null).catch(()=>null),
   ]).then(([p,r,a])=>{setProfile(p as CommunityProfile|null);setRestriction(r as Restriction|null);setAppeal(a as Appeal|null);})
    .finally(()=>{setChecked(true);setRestrictionChecked(true);});
 }),[]);

 async function refresh(){if(user){const p=await getCommunityProfile(user.uid);setProfile(p);if(p){setWelcome(true);window.setTimeout(()=>setWelcome(false),2600);}}}
 async function submitAppeal(){
   if(!user||!restriction||!appealText.trim()||submitting)return;
   setSubmitting(true);setAppealError('');
   try{
     const current=await getDoc(doc(db,'restrictionAppeals',user.uid));
     if(current.exists()) { setAppeal(current.data() as Appeal); setAppealError('An appeal has already been submitted for this restriction.'); return; }
     await setDoc(doc(db,'restrictionAppeals',user.uid),{
       uid:user.uid, email:user.email||'', reason:restriction.reason, mode:restriction.mode,
       message:appealText.trim().slice(0,1500), status:'pending', createdAt:serverTimestamp(),
     });
     setAppeal({status:'pending',message:appealText.trim()});setAppealText('');
   }catch(e){setAppealError(e instanceof Error?e.message:'Your appeal could not be submitted. Please try again.');}
   finally{setSubmitting(false);}
 }
 const blocked=restrictionChecked&&activeRestriction(restriction)&&restriction?.mode==='full';
 if(!checked||!restrictionChecked)return <div className="mx-auto max-w-3xl px-5 py-8 text-sm text-muted">Checking your Community access…</div>;
 if(user&&!profile)return <div className="mx-auto max-w-3xl px-5 py-8"><CommunityProfileSetup uid={user.uid} displayName={user.displayName||''} photoURL={user.photoURL} onComplete={()=>void refresh()}/></div>;
 return <>
   <div className={blocked?'pointer-events-none select-none blur-[5px] opacity-50':''} aria-hidden={blocked}>
     <CommunityFeed/>
   </div>
   {blocked&&<div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#211b13]/55 px-4 py-8 backdrop-blur-sm">
     <section role="dialog" aria-modal="true" aria-labelledby="suspension-title" className="my-auto w-full max-w-lg rounded-[26px] border border-[#d9c39d] bg-[#fffdf8] p-6 shadow-2xl sm:p-8">
       <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f5e9e4] text-2xl text-[#985247]">!</div>
       <p className="mt-5 text-center text-[9px] font-bold uppercase tracking-[.2em] text-[#a17b47]">Community access notice</p>
       <h1 id="suspension-title" className="mt-2 text-center font-serif text-3xl text-[#38291c]">Your Community access is suspended</h1>
       <p className="mt-3 text-center text-sm leading-6 text-[#766b5c]">Your account has been temporarily restricted from participating in Community because of a Community Guidelines violation.</p>
       <div className="mt-5 rounded-2xl border border-[#eadfce] bg-[#faf5eb] p-4">
         <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#9a7745]">Reason provided</p>
         <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#493a2a]">{restriction?.reason||'Please contact the UniVerse-City team for details.'}</p>
         <p className="mt-3 text-xs text-[#81786c]">{restriction?.expiresAt ? 'Restriction ends ' + restriction.expiresAt.toDate().toLocaleString() : 'This restriction has no scheduled expiry.'}</p>
       </div>
       {appeal?.status==='pending'?<p className="mt-5 rounded-xl bg-[#f3efe4] p-4 text-sm text-[#675333]">Your appeal has been submitted and is awaiting administrator review.</p>
       :appeal?.status==='rejected'?<div className="mt-5 rounded-xl bg-[#f8efec] p-4 text-sm text-[#874b41]">Your previous appeal was not approved. {appeal.decisionNote||''}</div>
       :<div className="mt-5">
         <label htmlFor="restriction-appeal" className="block text-xs font-semibold text-[#55432e]">Would you like to appeal this decision?</label>
         <textarea id="restriction-appeal" value={appealText} onChange={e=>setAppealText(e.target.value.slice(0,1500))} rows={4} maxLength={1500} placeholder="Explain why you believe this restriction should be reviewed…" className="mt-2 w-full rounded-xl border border-[#e5ddce] bg-white p-3 text-sm text-[#30251b] outline-none focus:border-[#a9813f]"/>
         <div className="mt-1 flex justify-between text-[10px] text-[#978b7a]"><span>Be respectful and include any helpful context.</span><span>{appealText.length}/1500</span></div>
         {appealError&&<p role="alert" className="mt-3 text-xs text-red-700">{appealError}</p>}
         <button onClick={()=>void submitAppeal()} disabled={!appealText.trim()||submitting} className="mt-4 w-full rounded-full bg-[#76501f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{submitting?'Submitting…':'Submit appeal'}</button>
       </div>}
       <p className="mt-5 text-center text-[10px] leading-5 text-[#9a8d7b]">You can still browse the rest of UniVerse-City. Only Community participation is affected.</p>
     </section>
   </div>}
   {welcome&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f8f3e8]/95 px-6 text-center"><div className="rounded-2xl border border-[#c9ad7d] bg-[#fffdf8] px-8 py-10 shadow-xl animate-[welcomeFade_2.6s_ease-in-out_forwards]"><p className="font-serif text-3xl leading-tight text-[#4b3925] sm:text-4xl">Welcome to UniVerse-City Community<span className="inline-block animate-bounce">!</span></p><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b7849]">Your conversation starts here</p></div></div>}
 </>;
}
