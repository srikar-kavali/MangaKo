import React from 'react';
import { Html, Head, Body } from 'expo-router/html';

// iOS takes the installed web-app icon from apple-touch-icon, not the
// Android favicon or the Expo native icon.
export default function HTML({ children }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#07070a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MangaKo" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/icon-192.png" />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { background: #07070a !important; margin: 0; min-height: 100%; }
          html { color-scheme: dark; }
          body { overscroll-behavior-y: none; }
          @supports (padding: env(safe-area-inset-top)) {
            html { min-height: 100dvh; }
          }
        ` }} />
      </Head>
      <Body>{children}</Body>
    </Html>
  );
}
