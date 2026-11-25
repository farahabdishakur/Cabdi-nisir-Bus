import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Cabdinasir Bus',
  description: 'Tigidh, ballan, alaab iyo sanduuq — Boorama · Wajaale',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/favicon-48.png', sizes: '48x48' }, { url: '/icons/icon.svg', type: 'image/svg+xml' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Cabdinasir Bus', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f2a6b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="so">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
