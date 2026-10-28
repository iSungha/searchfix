import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SearchFix — Local AI SEO Investigator',
  description: 'Compare Search Console exports, inspect public HTML, and investigate SEO evidence with optional Gemini analysis.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
