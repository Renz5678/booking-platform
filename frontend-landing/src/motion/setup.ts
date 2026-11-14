// Global motion for Alaga: runs once on the client before the first page initializes.
import { gsap } from "gsap";
import {
  ease,
  isTouch,
  onPage,
  prefersReducedMotion,
  setTransition,
} from "@/engine";

function initButtonFills() {
  return onPage(() => {
    if (isTouch() || prefersReducedMotion()) return;

    const getOrigin = (btn: HTMLElement, e: PointerEvent) => {
      const r = btn.getBoundingClientRect();
      return `${e.clientX - r.left}px ${e.clientY - r.top}px`;
    };

    const open = (btn: HTMLElement, at: string) => {
      const fill = btn.querySelector<HTMLElement>(".btn__fill");
      if (!fill) return;
      if (btn.dataset.fillState !== "open") {
        gsap.set(fill, { clipPath: `circle(0% at ${at})` });
      }
      btn.dataset.fillState = "open";
      btn.classList.add("is-filled");
      gsap.to(fill, {
        clipPath: `circle(150% at ${at})`,
        duration: 0.35,
        ease: ease.soft,
        overwrite: true,
      });
    };

    const close = (btn: HTMLElement, at: string) => {
      const fill = btn.querySelector<HTMLElement>(".btn__fill");
      if (!fill) return;
      btn.classList.remove("is-filled");
      gsap.to(fill, {
        clipPath: `circle(0% at ${at})`,
        duration: 0.45,
        ease: ease.soft,
        overwrite: true,
        onComplete: () => {
          btn.dataset.fillState = "closed";
        },
      });
    };

    const onPointerOver = (e: PointerEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-fill]");
      if (!btn || btn.contains(e.relatedTarget as Node | null)) return;
      open(btn, getOrigin(btn, e));
    };

    const onPointerOut = (e: PointerEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-fill]");
      if (!btn || btn.contains(e.relatedTarget as Node | null)) return;
      close(btn, getOrigin(btn, e));
    };

    const onFocusIn = (e: FocusEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-fill]");
      if (!btn || !btn.matches(":focus-visible")) return;
      open(btn, "50% 50%");
    };

    const onFocusOut = (e: FocusEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-fill]");
      if (!btn || btn.contains(e.relatedTarget as Node | null)) return;
      close(btn, "50% 50%");
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  });
}

export function setupMotion() {
  let point = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  window.addEventListener(
    "pointerdown",
    (e) => {
      point = { x: e.clientX, y: e.clientY };
    },
    { passive: true }
  );

  setTransition({
    leave: (c) =>
      gsap
        .timeline()
        .set(c, { autoAlpha: 1 })
        .set(c.querySelector(".curtain__panel"), { yPercent: 0 })
        .fromTo(
          c.querySelector(".curtain__panel"),
          { clipPath: `circle(0% at ${point.x}px ${point.y}px)` },
          {
            clipPath: `circle(150% at ${point.x}px ${point.y}px)`,
            duration: 0.72,
            ease: ease.inOut,
          }
        ),
    enter: (c) =>
      gsap
        .timeline()
        .to(c.querySelector(".curtain__panel"), {
          clipPath: "circle(0% at 50% 50%)",
          duration: 0.78,
          ease: ease.inOut,
        })
        .set(c, { autoAlpha: 0 }),
  });

  initButtonFills();
}
