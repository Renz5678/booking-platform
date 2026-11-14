'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { boot, cleanup, enter, leave, onPage, scrollToTarget, type PageFn } from './index';

export function Engine({ setup }: { setup?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const mode = useRef<'idle' | 'push' | 'pop'>('idle');
  const pendingHash = useRef<string>('');
  const first = useRef(true);

  useEffect(() => {
    boot(setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element).closest('a');
      if (
        !a ||
        (a.target && a.target !== '_self') ||
        a.hasAttribute('download') ||
        a.hasAttribute('data-no-transition')
      )
        return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;

      // Same-page hash navigation: scroll smoothly below sticky header
      if (url.pathname === location.pathname) {
        if (url.hash) {
          const target = document.getElementById(url.hash.slice(1));
          if (target) {
            e.preventDefault();
            history.pushState(null, '', url.hash);
            scrollToTarget(target);
          }
        }
        return;
      }

      e.preventDefault();
      if (mode.current !== 'idle') return;
      mode.current = 'push';
      pendingHash.current = url.hash;
      const href = url.pathname + url.search + url.hash;
      router.prefetch(href);
      await leave();
      cleanup();
      router.push(href, { scroll: false });
    };
    const onPop = () => {
      mode.current = 'pop';
      pendingHash.current = '';
      cleanup();
    };
    document.addEventListener('click', onClick, true);
    addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      removeEventListener('popstate', onPop);
    };
  }, [router]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const pop = mode.current === 'pop';
    const hash = pendingHash.current;
    pendingHash.current = '';
    mode.current = 'idle';
    enter({ transition: !pop, scrollTop: !pop && !hash }).then(() => {
      if (hash) {
        requestAnimationFrame(() => {
          const target = document.getElementById(hash.slice(1));
          if (target) scrollToTarget(target);
        });
      }
    });
  }, [pathname]);

  return null;
}

/** Component-level page code: runs when the page is ready, reverted on leave. */
export function usePage(fn: PageFn) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onPage(fn), []);
}
