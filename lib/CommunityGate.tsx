'use client';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { watchReaderAuth } from '@/lib/readerAuth';
import { getCommunityProfile, refreshCommunityPhoto, type CommunityProfile } from '@/lib/communityProfiles';
import { CommunityProfileSetup } from '@/lib/CommunityProfileSetup';
import { CommunityFeed } from '@/lib/CommunityFeed';
import { db } from '@/lib/firebase';
import { collection, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore/lite';
import type { Timestamp } from 'firebase/firestore/lite';

type Restriction = { reason: string; mode: 'full' | 'post' | 'comment'; active: boolean; expiresAt: Timestamp | null };
type Appeal = { status: 'pending' | 'approved' | 'rejected'; message: string; createdAt?: Timestamp; decisionNote?: string };
type WelcomeBackEvent = { eventId: string; seenEventId?: string | null };
function activeRestriction(item: Restriction | null) {
  return Boolean(item?.active && (!item.expiresAt || item.expiresAt.toDate().getTime() > Date.now()));
}

export function CommunityGate() {
 const [user,setUser]=useState<User|null>(null);
 const [profile,setProfile]=useState<CommunityProfile|null>(null);
 const [checked,setChecked]=useState(false);
 const [welcome,setWelcome]=useState(false);
 const [welcomeBackEvent,setWelcomeBackEvent]=useState<WelcomeBackEvent|null>(null);
 const [showWelcomeBack,setShowWelcomeBack]=useState(false);
 const [restriction,setRestriction]=useState<Restriction|null>(null);
 const [appeal,setAppeal]=useState<Appeal|null>(null);
 const [appealText,setAppealText]=useState('');
 const [appealModalOpen,setAppealModalOpen]=useState(false);
 const [appealSubmitted,setAppealSubmitted]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [appealError,setAppealError]=useState('');
 const [restrictionChecked,setRestrictionChecked]=useState(false);

 useEffect(()=>watchReaderAuth(u=>{
   setUser(u); setRestriction(null); setAppeal(null); setWelcomeBackEvent(null); setShowWelcomeBack(false); setRestrictionChecked(!u);
   if(!u){setProfile(null);setChecked(true);return;}
   setChecked(false);
   Promise.all([
     refreshCommunityPhoto(u.uid,u.photoURL).catch(()=>getCommunityProfile(u.uid).catch(()=>null)),
     getDoc(doc(db,'accountRestrictions',u.uid)).then(s=>s.exists()?s.data() as Restriction:null).catch(()=>null),
     getDoc(doc(db,'restrictionAppeals',u.uid)).then(s=>s.exists()?s.data() as Appeal:null).catch(()=>null),
     getDoc(doc(db,'restrictionWelcomeBack',u.uid)).then(s=>s.exists()?s.data() as WelcomeBackEvent:null).catch(()=>null),
   ]).then(([p,r,a,w])=>{setProfile(p as CommunityProfile|null);setRestriction(r as Restriction|null);setAppeal(a as Appeal|null);setWelcomeBackEvent(w as WelcomeBackEvent|null);})
    .finally(()=>{setChecked(true);setRestrictionChecked(true);});
 }),[]);

 async function refresh(){if(user){const p=await getCommunityProfile(user.uid);setProfile(p);if(p){setWelcome(true);window.setTimeout(()=>setWelcome(false),2600);}}}
 async function submitAppeal(){
   if(!user||!restriction||!appealText.trim()||submitting)return;
   setSubmitting(true);setAppealError('');
   try{
     const appealRef=doc(db,'restrictionAppeals',user.uid);
     const current=await getDoc(appealRef);
     const message=appealText.trim().slice(0,1500);
     if(current.exists()) {
       const existing=current.data() as Appeal;
       if(existing.status==='pending') {
         // The appeal is already safely recorded; show the same confirmation
         // instead of treating a repeat click or earlier successful save as an error.
         setAppeal(existing);
         setAppealText('');
         setAppealError('');
         setAppealSubmitted(true);
         return;
       }
       if(existing.status!=='rejected' && existing.status!=='approved') {
         setAppeal(existing);
         setAppealError('Your appeal is already awaiting review.');
         return;
       }
       await updateDoc(appealRef,{
         message, status:'pending', createdAt:serverTimestamp(),
         decisionNote:deleteField(), reviewedBy:deleteField(), reviewedAt:deleteField(),
       });
     } else {
       await setDoc(appealRef,{
         uid:user.uid, email:user.email||'', reason:restriction.reason, mode:restriction.mode,
         message, status:'pending', createdAt:serverTimestamp(),
       });
     }
     setAppeal({status:'pending',message:appealText.trim()});setAppealText('');setAppealSubmitted(true);
   }catch(e){setAppealError(e instanceof Error?e.message:'Your appeal could not be submitted. Please try again.');}
   finally{setSubmitting(false);}
 }
 const blocked=restrictionChecked&&activeRestriction(restriction)&&restriction?.mode==='full';
 useEffect(()=>{
   if(!checked||!restrictionChecked||!user||!profile||blocked||!welcomeBackEvent?.eventId||welcomeBackEvent.seenEventId===welcomeBackEvent.eventId)return;
   setShowWelcomeBack(true);
   setWelcomeBackEvent(current=>current?{...current,seenEventId:current.eventId}:current);
   void updateDoc(doc(db,'restrictionWelcomeBack',user.uid),{seenEventId:welcomeBackEvent.eventId}).catch(()=>{
     setWelcomeBackEvent(current=>current?{...current,seenEventId:null}:current);
   });
 },[checked,restrictionChecked,user,profile,blocked,welcomeBackEvent]);
 useEffect(()=>{
   if(!blocked)return;
   const scrollY=window.scrollY;
   const body=document.body;
   const html=document.documentElement;
   const previous={
     bodyPosition:body.style.position,
     bodyTop:body.style.top,
     bodyWidth:body.style.width,
     bodyOverflow:body.style.overflow,
     htmlOverflow:html.style.overflow,
   };
   html.style.overflow='hidden';
   body.style.position='fixed';
   body.style.top=`-${scrollY}px`;
   body.style.width='100%';
   body.style.overflow='hidden';
   return ()=>{
     body.style.position=previous.bodyPosition;
     body.style.top=previous.bodyTop;
     body.style.width=previous.bodyWidth;
     body.style.overflow=previous.bodyOverflow;
     html.style.overflow=previous.htmlOverflow;
     window.scrollTo(0,scrollY);
   };
 },[blocked]);
 if(!checked||!restrictionChecked)return <div className="mx-auto max-w-3xl px-5 py-8 text-sm text-muted">Checking your Community access…</div>;
 if(user&&!profile)return <div className="mx-auto max-w-3xl px-5 py-8"><CommunityProfileSetup uid={user.uid} displayName={user.displayName||''} photoURL={user.photoURL} onComplete={()=>void refresh()}/></div>;
 return <>
   <div className={blocked?'pointer-events-none select-none blur-[5px] opacity-50':''} aria-hidden={blocked}>
     <CommunityFeed/>
   </div>
   {blocked&&<div className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden overscroll-none bg-[#211b13]/55 px-3 py-3 backdrop-blur-sm">
     <section role="dialog" aria-modal="true" aria-labelledby="suspension-title" className="w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[26px] border border-[#d9c39d] bg-[#fffdf8] p-4 shadow-2xl sm:p-8">
       <div className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5e9e4] text-xl text-[#985247] sm:h-14 sm:w-14 sm:text-2xl">!</div>
       <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[.2em] text-[#a17b47] sm:mt-5">Community access notice</p>
       <h1 id="suspension-title" className="mt-1 text-center font-serif text-2xl text-[#38291c] sm:mt-2 sm:text-3xl">Your Community access is suspended</h1>
       <p className="mt-2 text-center text-xs leading-5 text-[#766b5c] sm:mt-3 sm:text-sm sm:leading-6">Your account has been temporarily restricted from participating in Community because of a Community Guidelines violation.</p>
       <div className="mt-3 rounded-2xl border border-[#eadfce] bg-[#faf5eb] p-3 sm:mt-5 sm:p-4">
         <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#9a7745]">Reason provided</p>
         <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#493a2a]">{restriction?.reason||'Please contact the UniVerse-City team for details.'}</p>
         <p className="mt-3 text-xs text-[#81786c]">{restriction?.expiresAt ? 'Restriction ends ' + (()=>{const date=restriction.expiresAt!.toDate();const day=date.getDate();const suffix=day%100>=11&&day%100<=13?'th':day%10===1?'st':day%10===2?'nd':day%10===3?'rd':'th';return `${day}${suffix} ${date.toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`;})() : 'This restriction has no scheduled expiry.'}</p>
       </div>
       {appeal?.status==='pending'?<p className="mt-5 rounded-xl bg-[#f3efe4] p-4 text-sm text-[#675333]">Your appeal has been submitted and is awaiting administrator review.</p>
       :<div className="mt-5">
         {appeal?.status==='rejected'&&<div className="mb-4 rounded-xl bg-[#f8efec] p-4 text-sm text-[#874b43]"><p className="font-semibold">Your previous appeal was not approved.</p>{appeal.decisionNote&&<p className="mt-1">{appeal.decisionNote}</p>}<p className="mt-2 text-xs">You may submit a new appeal with additional information for another review.</p></div>}
         <p className="text-xs leading-5 text-[#766b5c]">Would you like to appeal this decision?</p>
         {appealError&&<p role="alert" className="mt-3 text-xs text-red-700">{appealError}</p>}
         <button onClick={()=>setAppealModalOpen(true)} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#76501f] px-5 py-3 text-sm font-semibold leading-none text-white shadow-[0_4px_0_#4f3515] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#89612b] hover:shadow-[0_5px_0_#4f3515] active:translate-y-[2px] active:shadow-[0_2px_0_#4f3515] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9813f] focus-visible:ring-offset-2"> {appealText.trim()?'Continue editing appeal':'Write an appeal'} </button>
       </div>}
      </section>
   </div>}
   {appealModalOpen&&blocked&&<div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#211b13]/70 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-6">
     <section role="dialog" aria-modal="true" aria-labelledby="appeal-modal-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border border-[#d9c39d] bg-[#fffdf8] shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
       {appealSubmitted?<div className="px-6 py-9 text-center sm:px-9 sm:py-12">
         <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f3e7] text-2xl font-semibold text-[#47734b]">✓</div>
         <div className="mx-auto mt-5 max-w-md rounded-2xl border border-[#cfe3cc] bg-[#eff7ed] px-5 py-5 text-[#426746]">
           <h2 id="appeal-modal-title" className="font-serif text-2xl text-[#365b3b] sm:text-3xl">Appeal Submitted</h2>
           <p className="mt-2 text-sm leading-6">Your appeal has been received and is waiting for review. We’ll update you once it has been reviewed.</p>
         </div>
         <button type="button" onClick={()=>{setAppealSubmitted(false);setAppealModalOpen(false);}} className="mt-6 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-full bg-[#76501f] px-7 py-3 text-sm font-semibold text-white shadow-[0_4px_0_#4f3515] transition-all hover:-translate-y-0.5 hover:bg-[#89612b] active:translate-y-[2px] active:shadow-[0_2px_0_#4f3515]">Okay</button>
       </div>:<>
         <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#eadfce] px-5 py-4 sm:px-7 sm:py-5">
           <div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a17b47]">Community access review</p><h2 id="appeal-modal-title" className="mt-1 font-serif text-2xl text-[#38291c] sm:text-3xl">Write your appeal</h2><p className="mt-1 text-xs text-[#766b5c]">Explain your situation and why you believe your restriction should be reviewed.</p></div>
           <button type="button" onClick={()=>setAppealModalOpen(false)} aria-label="Close appeal form" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5ddce] text-xl leading-none text-[#766b5c] transition hover:bg-[#f5efe5]">×</button>
         </header>
         <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7 sm:py-6">
           <label htmlFor="restriction-appeal" className="block text-sm font-semibold text-[#55432e]">Your message</label>
           <textarea id="restriction-appeal" autoFocus value={appealText} onChange={e=>setAppealText(e.target.value.slice(0,1500))} maxLength={1500} placeholder="Explain what happened, provide any helpful context, and tell us why you would like the decision reviewed…" className="mt-3 min-h-[min(48vh,380px)] w-full resize-y rounded-2xl border border-[#e5ddce] bg-white p-4 text-sm leading-7 text-[#30251b] outline-none transition focus:border-[#a9813f] focus:ring-2 focus:ring-[#a9813f]/15"/>
           <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#978b7a]"><span>Be respectful and include any relevant details.</span><span className="font-semibold tabular-nums">{appealText.length}/1500</span></div>
           {appealError&&<p role="alert" className="mt-4 rounded-xl bg-[#f8efec] p-3 text-sm text-red-700">{appealError}</p>}
         </div>
         <footer className="shrink-0 border-t border-[#eadfce] bg-[#fffdf8] px-5 py-4 sm:px-7">
           <button type="button" onClick={()=>void submitAppeal()} disabled={!appealText.trim()||submitting} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#76501f] px-7 py-3 text-sm font-semibold text-white shadow-[0_4px_0_#4f3515] transition-all hover:-translate-y-0.5 hover:bg-[#89612b] active:translate-y-[2px] active:shadow-[0_2px_0_#4f3515] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">{submitting?'Submitting…':'Submit appeal'}</button>
         </footer>
       </>}
     </section>
   </div>}
   {showWelcomeBack&&!blocked&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#211b13]/60 px-5 py-6 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="welcome-back-title" className="w-full max-w-md rounded-[26px] border border-[#d9c39d] bg-[#fffdf8] px-7 py-8 text-center shadow-2xl sm:px-9 sm:py-10"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf4e9] text-2xl text-[#426d48]">✓</div><p className="mt-4 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Community access restored</p><h2 id="welcome-back-title" className="mt-2 font-serif text-3xl text-[#38291c]">Welcome back!</h2><p className="mt-3 text-sm leading-6 text-[#766b5c]">Your appeal has been approved and your restriction has been lifted. Your Community access has been restored. You’re welcome to participate again.</p><button onClick={()=>setShowWelcomeBack(false)} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#76501f] px-5 py-3 text-sm font-semibold text-white shadow-[0_4px_0_#4f3515] transition hover:-translate-y-0.5 hover:bg-[#89612b] active:translate-y-[2px] active:shadow-none">Continue to Community</button></section></div>}
   {welcome&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f8f3e8]/95 px-6 text-center"><div className="rounded-2xl border border-[#c9ad7d] bg-[#fffdf8] px-8 py-10 shadow-xl animate-[welcomeFade_2.6s_ease-in-out_forwards]"><p className="font-serif text-3xl leading-tight text-[#4b3925] sm:text-4xl">Welcome to UniVerse-City Community<span className="inline-block animate-bounce">!</span></p><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b7849]">Your conversation starts here</p></div></div>}
 </>;
}
