'use client';

const BROWN_CHECKMARK_SVG =
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Eo_circle_brown_checkmark.svg';

export function VerificationBadge({ className = 'inline-block h-4 w-4' }: { className?: string }) {
  return (
    <img
      src={BROWN_CHECKMARK_SVG}
      alt="Verified account"
      role="img"
      title="Verified account"
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}

/*
 * Badge artwork: "Eo circle brown checkmark.svg"
 * Author: Emoji One contributors
 * Source: https://commons.wikimedia.org/wiki/File:Eo_circle_brown_checkmark.svg
 * License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
 * The original SVG is used without modification.
 */
