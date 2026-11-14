// Declarative motion through data attributes. Authoring happens in markup:
//   data-split="lines|words|chars"   masked text reveal (SplitText), on scroll or on intro
//   data-reveal="up|fade|clip|scale"  block reveal
//   data-intro                        play with the page intro instead of on scroll
//   data-delay="0.2"                  extra delay (seconds)
//   data-parallax="0.15"              scrubbed vertical drift (fraction of element height)
// Every effect is skipped under reduced motion; CSS keeps content visible without JS.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ease, prefersReducedMotion } from './env';

gsap.registerPlugin(ScrollTrigger, SplitText);

const durations = { lines: 0.65, words: 0.6, chars: 0.5 } as const;
const staggers = { lines: 0.055, words: 0.024, chars: 0.012 } as const;

function onVisible(el: HTMLElement, play: () => void) {
  let done = false;
  let io: IntersectionObserver | null = null;
  const trigger = () => {
    if (done) return;
    done = true;
    play();
    io?.disconnect();
  };

  if (el.getBoundingClientRect().top < window.innerHeight * 0.98) {
    trigger();
    return;
  }

  io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((e) => e.isIntersecting || e.boundingClientRect.top < window.innerHeight)) {
              trigger();
            }
          },
          { rootMargin: '0px 0px 40px 0px', threshold: 0.01 }
        )
      : null;
  io?.observe(el);

  ScrollTrigger.create({
    trigger: el,
    start: 'top 98%',
    once: true,
    onEnter: trigger,
    onEnterBack: trigger,
  });
}

function splitTween(el: HTMLElement, isIntro: boolean) {
  const type = (el.dataset.split || 'lines') as keyof typeof durations;
  const delay = parseFloat(el.dataset.delay || '0');
  const s = {
    tween: undefined as gsap.core.Tween | undefined,
    done: false,
    requested: false,
  };
  SplitText.create(el, {
    type: type === 'lines' ? 'lines' : `lines,${type}`,
    mask: 'lines',
    autoSplit: true,
    linesClass: 'split-line',
    onSplit(self) {
      gsap.set(el, { visibility: 'visible' });
      if (s.done) return;
      const targets =
        type === 'lines' ? self.lines : type === 'words' ? self.words : self.chars;
      s.tween = gsap.from(targets, {
        yPercent: 110,
        rotate: type === 'chars' ? 0 : 1.5,
        duration: durations[type],
        stagger: staggers[type],
        ease: ease.out,
        delay,
        paused: true,
        onComplete: () => {
          s.done = true;
        },
      });
      if (s.requested) s.tween.play();
      else if (!isIntro) onVisible(el, () => s.tween?.play());
      return s.tween;
    },
  });
  return () => {
    s.requested = true;
    s.tween?.play();
  };
}

function blockTween(el: HTMLElement, isIntro: boolean) {
  const kind = el.dataset.reveal || 'up';
  const delay = parseFloat(el.dataset.delay || '0');
  const from: gsap.TweenVars =
    kind === 'fade'
      ? { autoAlpha: 0 }
      : kind === 'clip'
        ? { clipPath: 'inset(100% 0% 0% 0%)', autoAlpha: 1 }
        : kind === 'scale'
          ? { scale: 1.08, clipPath: 'inset(8% 8% 8% 8%)', autoAlpha: 1 }
          : { y: 20, autoAlpha: 0 };
  const to: gsap.TweenVars =
    kind === 'clip' || kind === 'scale'
      ? { clipPath: 'inset(0% 0% 0% 0%)', scale: 1 }
      : {};
  gsap.set(el, { visibility: 'visible' });
  const tween = gsap.fromTo(el, from, {
    ...to,
    y: 0,
    autoAlpha: 1,
    duration: kind === 'fade' ? 0.55 : 0.65,
    ease: ease.out,
    delay,
    paused: true,
    onComplete: () => {
      gsap.set(el, { clearProps: 'transform' });
    },
  });
  if (!isIntro) onVisible(el, () => tween.play());
  return tween;
}

/** Wire every reveal inside `root`. Returns the intro timeline (paused) for the page entrance. */
export function initReveals(root: ParentNode = document) {
  const intro = gsap.timeline({ paused: true });
  if (prefersReducedMotion()) return intro;

  root.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const isIntro = el.hasAttribute('data-intro');
    const play = splitTween(el, isIntro);
    if (isIntro) intro.add(play, 0);
  });
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    const isIntro = el.hasAttribute('data-intro');
    const t = blockTween(el, isIntro);
    if (isIntro) intro.add(() => t.play(), 0);
  });
  root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const amount = parseFloat(el.dataset.parallax || '0.15');
    gsap.fromTo(
      el,
      { yPercent: -amount * 100 },
      {
        yPercent: amount * 100,
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement || el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );
  });
  requestAnimationFrame(() => ScrollTrigger.refresh());
  return intro;
}
