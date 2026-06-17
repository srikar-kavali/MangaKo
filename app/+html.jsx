import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

export default function RootHtml({ children }) {
    return (
        <html lang="en">
        <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
            <meta name="apple-mobile-web-app-title" content="Mangako" />
            <ScrollViewStyleReset />
            <style dangerouslySetInnerHTML={{ __html: responsiveBackgroundStyles }} />
        </head>
        <body>{children}</body>
        </html>
    );
}

const responsiveBackgroundStyles = `
  html, body, #root {
    background-color: #0c0c10 !important;
    min-height: 100% !important;
    margin: 0;
    padding: 0;
  }
`;