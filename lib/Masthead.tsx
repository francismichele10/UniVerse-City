'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { SiteSettings } from '@/lib/types';

function toSlug(cat: string) {
  return cat
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/&/g, 'and');
}

const NAV_SCROLL_KEY = 'universe-city-nav-scroll';

export function Masthead({
  settings,
  currentCategory,
  currentPage,
  showNav = true,
}: {
  settings: SiteSettings;
  currentCategory?: string;
  currentPage?: 'about' | 'interviews';
  showNav?: boolean;
}) {
  const navScrollRef = useRef<HTMLDivElement>(null);

  /*
   * Restore the exact horizontal position the user left
   * the mobile navigation at.
   *
   * Important:
   * We do NOT automatically move the navigation when
   * a link is clicked. The only thing that changes the
   * position is the user's own horizontal swipe/scroll.
   */
  useEffect(() => {
    const container = navScrollRef.current;

    if (!container) return;

    const isMobile = window.matchMedia('(max-width: 639px)').matches;

    if (!isMobile) return;

    const savedPosition = sessionStorage.getItem(NAV_SCROLL_KEY);

    if (savedPosition !== null) {
      const scrollPosition = Number(savedPosition);

      if (Number.isFinite(scrollPosition)) {
        requestAnimationFrame(() => {
          container.scrollLeft = scrollPosition;
        });
      }
    }

    const handleScroll = () => {
      sessionStorage.setItem(
        NAV_SCROLL_KEY,
        String(container.scrollLeft)
      );
    };

    container.addEventListener('scroll', handleScroll, {
      passive: true,
    });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  /*
   * Save the latest position immediately before the current
   * page is left.
   */
  useEffect(() => {
    const container = navScrollRef.current;

    if (!container) return;

    const savePosition = () => {
      const isMobile = window.matchMedia(
        '(max-width: 639px)'
      ).matches;

      if (!isMobile) return;

      sessionStorage.setItem(
        NAV_SCROLL_KEY,
        String(container.scrollLeft)
      );
    };

    window.addEventListener('pagehide', savePosition);

    return () => {
      window.removeEventListener('pagehide', savePosition);
    };
  }, []);

  return (
    <>
      {/* =========================================
          MASTHEAD
          ========================================= */}
      <header className="site-masthead">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">

          {/* Top information */}
          <div className="flex items-center justify-between border-b border-rule py-3 text-[10px] uppercase tracking-[0.18em] text-muted">
            <span>Student Publication</span>
            <span>Est. {settings.estYear}</span>
          </div>

          {/* Main masthead */}
          <div className="py-6 text-center sm:py-8">
            {/* SECRET ADMIN SHORTCUT:
                Clicking the logo opens the admin area.
                The visible UniVerse-City title below
                still returns to the public homepage. */}
            <Link
              href="/admin"
              className="inline-flex items-center justify-center"
              aria-label="UniVerse-City"
            >
              <img
                src="/logo.png"
                alt={settings.siteName}
                className="masthead-logo h-14 w-auto object-contain sm:h-16"
              />
            </Link>

            {/* Public homepage link */}
            <Link href="/" className="block">
              <h1 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
                {settings.siteName}
              </h1>
            </Link>

            <p className="mt-1 text-sm italic text-muted">
              {settings.tagline}
            </p>
          </div>
        </div>
      </header>

      {/* =========================================
          STICKY NAVIGATION
          ========================================= */}
      {showNav && (
        <div className="site-nav-sticky">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <nav
              aria-label="Main navigation"
              className="site-navigation"
            >
              <div
                ref={navScrollRef}
                className="site-navigation-inner"
              >
                {/* HOME */}
                <Link
                  href="/"
                  className={`nav-link ${
                    !currentCategory && !currentPage
                      ? 'nav-link-active'
                      : ''
                  }`}
                >
                  Home
                </Link>

                {/* CATEGORIES */}
                {settings.categories.map((cat) => {
                  const isActive = currentCategory === cat;

                  return (
                    <Link
                      key={cat}
                      href={`/category/${toSlug(cat)}`}
                      className={`nav-link ${
                        isActive
                          ? 'nav-link-active'
                          : ''
                      }`}
                    >
                      {cat}
                    </Link>
                  );
                })}

                {/* INTERVIEWS */}
                <Link
                  href="/interviews"
                  className={`nav-link ${
                    currentPage === 'interviews' ? 'nav-link-active' : ''
                  }`}
                >
                  Interviews
                </Link>

                {/* ABOUT */}
                <Link
                  href="/about"
                  className={`nav-link ${
                    currentPage === 'about'
                      ? 'nav-link-active'
                      : ''
                  }`}
                >
                  About
                </Link>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}