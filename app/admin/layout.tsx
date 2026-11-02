'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { watchAdminAuth, isEmailAdmin, signOutAdmin } from '@/lib/adminAuth';

const nav = [
  { href: '/admin', label: 'Posts', icon: '▤', detail: 'Publication' },
  { href: '/admin/interviews', label: 'Interviews', icon: '◫', detail: 'Conversations' },
  { href: '/admin/community', label: 'Community', icon: '◎', detail: 'Student conversations' },
  { href: '/admin/reports', label: 'Reported content', icon: '⚑', detail: 'Safety review' },
  { href: '/admin/restrictions', label: 'Account restrictions', icon: '⊘', detail: 'Access control' },
  { href: '/admin/verification', label: 'Verification', icon: '✓', detail: 'Student identity' },
  { href: '/admin/moderation', label: 'Moderation history', icon: '◷', detail: 'Staff actions' },
  { href: '/admin/analytics', label: 'Analytics', icon: '▥', detail: 'Audience' },
  { href: '/admin/comments', label: 'Comments', icon: '▧', detail: 'Moderation' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙', detail: 'Configuration' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsub = watchAdminAuth(async (u) => {
      if (pathname === '/admin/login') {
        setChecked(true);
        return;
      }
      if (!u?.email || !(await isEmailAdmin(u.email))) {
        router.replace('/admin/login');
        return;
      }
      setUser(u);
      setChecked(true);
    });
    return () => unsub();
  }, [pathname, router]);

  if (!checked) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f3ee] text-sm text-[#77766f]">Verifying your access…</div>;
  }
  if (pathname === '/admin/login') return <>{children}</>;

  const initials = (user?.displayName || user?.email || '?')
    .split('@')[0]
    .split(/[ ._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f3ee] text-[#242722] lg:flex">
      <aside className="relative z-20 flex w-full flex-col bg-[#202720] text-white lg:fixed lg:inset-y-0 lg:w-[258px]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 lg:block lg:px-7 lg:py-8">
          <Link href="/admin" className="group block">
            <span className="block font-serif text-[25px] leading-none tracking-[-0.04em]">UniVerse<span className="text-[#c6a36a]">-</span>City</span>
            <span className="mt-2 block text-[9px] font-semibold uppercase tracking-[0.25em] text-white/45">Administration</span>
          </Link>
          <span className="rounded-full border border-[#c6a36a]/30 bg-[#c6a36a]/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#d7bb8b] lg:hidden">Control desk</span>
        </div>

        <div className="hidden px-7 pb-3 pt-7 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/35 lg:block">Workspace</div>
        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-3 py-3 scrollbar-none lg:flex-1 lg:flex-col lg:overflow-visible lg:px-4 lg:py-0">
          {nav.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                className={`group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 lg:px-4 lg:py-3 ${active ? 'bg-[#c6a36a] text-[#202720] shadow-lg shadow-black/10' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'}`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/10 text-base">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold">{item.label}</span>
                  <span className={`hidden text-[9px] lg:block ${active ? 'text-[#202720]/65' : 'text-white/35'}`}>{item.detail}</span>
                </span>
                {active && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#202720] lg:block" />}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/10 p-5 lg:block">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#c6a36a]">Your workspace</p>
            <p className="mt-2 text-xs leading-5 text-white/65">A considered space to publish, manage and grow the UniVerse-City platform.</p>
          </div>
          <Link href="/" className="mt-4 flex items-center gap-2 px-2 py-2 text-[11px] font-medium text-white/55 transition hover:text-white">↗ <span>Visit public website</span></Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-[258px]">
        <header className="sticky top-0 z-10 border-b border-[#e6e1d7] bg-[#fbfaf7]/90 backdrop-blur-xl">
          <div className="flex min-h-[68px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9a7745]">UniVerse-City / Admin</p>
              <p className="mt-1 truncate text-xs text-[#77766f]">{nav.find((item) => item.href === pathname || (item.href !== '/admin' && pathname.startsWith(item.href)))?.label || 'Workspace'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={() => router.push('/')} className="hidden rounded-full border border-[#ded9cf] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#575950] transition hover:border-[#b28b53] hover:bg-white sm:block">View website ↗</button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7c6a8] bg-[#eee6d8] text-[11px] font-bold text-[#72552f]">{initials}</div>
              <div className="hidden max-w-[190px] sm:block">
                <p className="truncate text-[11px] font-semibold text-[#34372f]">{user?.displayName || 'Administrator'}</p>
                <p className="max-w-[190px] truncate text-[9px] text-[#89877f]">{user?.email}</p>
              </div>
              <button onClick={() => signOutAdmin().then(() => router.push('/admin/login'))} className="rounded-full px-2 py-2 text-[10px] font-semibold text-[#77766f] transition hover:bg-[#eeeae2] hover:text-[#242722]">Sign out</button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10 lg:py-10">
          {children}
          <footer className="mt-14 flex flex-col gap-2 border-t border-[#e3ded4] py-5 text-[9px] uppercase tracking-[0.14em] text-[#a09c91] sm:flex-row sm:items-center sm:justify-between">
            <span>UniVerse-City · Administration</span>
            <span>Built for the people behind the publication</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
