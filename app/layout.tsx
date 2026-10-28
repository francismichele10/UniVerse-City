
import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = 'https://universecityhub.com';

const SITE_DESCRIPTION =
  'UniVerse-City is a student publication featuring student news, stories, ideas, academics, sports, arts and culture, and technology.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'UniVerse-City | Student News, Stories & Interviews',
    template: '%s | UniVerse-City',
  },

  description: SITE_DESCRIPTION,

  // Canonical URLs should be defined by individual pages where needed.

  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'UniVerse-City',
    title: 'UniVerse-City | Student News, Stories & Interviews',
    description: SITE_DESCRIPTION,
  },

  twitter: {
    card: 'summary_large_image',
    title: 'UniVerse-City | Student News, Stories & Interviews',
    description: SITE_DESCRIPTION,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />

        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500;1,6..72,600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'UniVerse-City',
              alternateName: 'UniVerse City',
              url: SITE_URL,
            }),
          }}
        />
      </head>

      <body className="bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
