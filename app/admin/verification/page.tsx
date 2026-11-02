'use client';
import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, addDoc } from 'firebase/firestore/lite';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebaseAuth';
import { VerificationBadge } from '@/lib/VerificationBadge';

type Profile = { uid: string; displayName: string; username: string; photoURL: string | null; verified: boolean };
export default function VerificationAdminPage() {
 const [items,setItems]=useState<Profile[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const snap=await getDocs(query(collection(db,'communityProfiles'),orderBy('displayName'),limit(200)));setItems(snap.docs.map(d=>({uid:d.id,...d.data()} as Profile)));}catch(e){setError(e instanceof Error?e.message:'Could not load profiles.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function toggle(profile:Profile){const next=!profile.verified;try{await updateDoc(doc(db,'communityProfiles',profile.uid),{verified:next,updatedAt:serverTimestamp()});await addDoc(collection(db,'moderationLogs'),{actorEmail:auth.currentUser?.email||'',action:next?'verification_granted':'verification_revoked',targetUid:profile.uid,reason:'Community verification status changed',createdAt:serverTimestamp()});setItems(old=>old.map(p=>p.uid===profile.uid?{...p,verified:next}:p));}catch(e){setError(e instanceof Error?e.message:'Could not update verification.');}}
 const visible=items.filter(p=>[p.displayName,p.username,p.uid].some(v=>v.toLowerCase().includes(search.toLowerCase())));
 return <div><div className="border-b border-[#e5dfd4] pb-6"><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a17b47]">Community · Identity</p><h1 className="mt-2 font-serif text-4xl text-[#292e28]">Verification</h1><p className="mt-2 text-sm text-[#77766f]">Grant or revoke the verified badge for approved students and staff.</p></div>
 {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
 <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, username or UID" className="mt-6 w-full rounded-xl border border-[#e3ded4] bg-white px-4 py-3 text-sm sm:max-w-md"/>
 <section className="mt-5 overflow-hidden rounded-2xl border border-[#e7e2d8] bg-[#fbfaf7]">{loading?<p className="p-6 text-sm">Loading profiles…</p>:visible.length===0?<p className="p-6 text-sm text-[#77766f]">No matching profiles.</p>:visible.map(p=><div key={p.uid} className="flex flex-col gap-3 border-b border-[#eee9e0] p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#34372f]">{p.displayName}{p.verified&&<VerificationBadge/>}</p><p className="mt-1 text-xs text-[#77766f]">@{p.username} · {p.uid}</p></div><button onClick={()=>void toggle(p)} className="self-start rounded-full border border-[#ded9cf] px-4 py-2 text-[10px] font-bold uppercase tracking-wide">{p.verified?'Revoke badge':'Grant badge'}</button></div>)}</section>
 <p className="mt-3 text-[10px] text-[#96938a]">Showing up to 200 profiles. Verification changes are recorded in moderation history.</p></div>;
}
