import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

// This file configures the web-built root document tags for Expo Router
export default function RootHtml({ children }) {
    return (
        <html lang="en">
        <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

            <!-- This forces the web layout to lock into mobile device dimensions -->
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

            <!-- Tells iOS Safari to allow full-screen web app mode -->
            <meta name="apple-mobile-web-app-capable" content="yes" />

            <!-- Makes the top status bar overlay beautifully with your app background -->
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
            <meta name="apple-mobile-web-app-title" content="Mangako" />

            <ScrollViewStyleReset />

            <style dangerouslySetInnerHTML={{ __html: responsiveBackgroundStyles }} />
        </head>
        <body>{children}</body>
        </html>
    );
}

// Global CSS injection to enforce full viewport height and clear background colors
const responsiveBackgroundStyles = `
  html, body, #root {
    background-color: #07070a !important;
    min-height: 100vh !important;
    height: 100% !important;
    overflow: hidden;
  }
`;