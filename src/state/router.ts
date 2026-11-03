import { useEffect, useState } from 'react';

// Hash routing works on any static host (Vercel, an artifact, a file) with no rewrites.

export interface Route {
  path: string; // e.g. "/bus/route/campus-loop"
  params: URLSearchParams;
}

function read(): Route {
  const h = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', params: new URLSearchParams(qs ?? '') };
}

export function useRoute(): Route {
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => {
      setR(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function navigate(to: string) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function href(to: string): string {
  return to.startsWith('#') ? to : `#${to}`;
}
