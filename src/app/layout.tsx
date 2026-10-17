import React from 'react';
import './globals.css';

export const metadata = {
  title: 'IELTS Academic Feedback Engine',
  description: 'AI-assisted IELTS Writing evaluation with side-by-side diff and mistake bank',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-neutral-50 text-neutral-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
