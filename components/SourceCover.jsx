import React, { useEffect, useMemo, useState } from 'react';
import { Image } from 'react-native';
import { proxied as proxiedMangapill, unwrapImageProxyUrl } from '../manga_api/mangapill';

// Prefer fresh provider artwork; use the curated cover only if earlier
// candidates cannot be loaded. Never route a failed Worker request to Vercel.
export function coverSources(...groups) {
    const values = groups.flat(Infinity);
    const seen = new Set();
    return values.map(raw => unwrapImageProxyUrl(raw))
        .filter(url => {
            if (typeof url !== 'string' || !/^https:\/\//i.test(url) || seen.has(url)) return false;
            seen.add(url);
            return true;
        });
}

export default function SourceCover({ urls = [], style, resizeMode = 'cover', placeholder = null, ...imageProps }) {
    const key = JSON.stringify(urls);
    const sources = useMemo(() => coverSources(urls).map(proxiedMangapill).filter(Boolean), [key]);
    const [index, setIndex] = useState(0);
    useEffect(() => { setIndex(0); }, [key]);
    const uri = sources[index];
    return uri
        ? <Image {...imageProps} source={{ uri, cache: 'force-cache' }} style={style} resizeMode={resizeMode}
                 onError={() => setIndex(current => current + 1)} />
        : placeholder;
}
