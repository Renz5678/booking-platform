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
    const cleanups: (() => void)[] = [];

    document.querySelectorAll<HTMLElement>("[data-fill]").forEach((btn) => {
      const fill = btn.querySelector<HTMLElement>(".btn__fill");
      if (!fill) return;

      const from = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        return `${e.clientX - r.left}px ${e.clientY - r.top}px`;
      };

      let closed = true;
      const open = (at: string) => {
        if (closed) gsap.set(fill, { clipPath: `circle(0% at ${at})` });
        closed = false;
        btn.classList.add("is-filled");
        gsap.to(fill, {
          clipPath: `circle(150% at ${at})`,
          duration: 0.55,
          ease: ease.soft,
          overwrite: true,
        });
      };

      const close = (at: string) => {
        btn.classList.remove("is-filled");
        gsap.to(fill, {
          clipPath: `circle(0% at ${at})`,
          duration: 0.45,
          ease: ease.soft,
          overwrite: true,
          onComplete: () => {
            closed = true;
          },
        });
      };

      const onEnter = (e: PointerEvent) => open(from(e));
      const onLeave = (e: PointerEvent) => close(from(e));
      const onFocus = () => btn.matches(":focus-visible") && open("50% 50%");
      const onBlur = () => close("50% 50%");

      btn.addEventListener("pointerenter", onEnter);
      btn.addEventListener("pointerleave", onLeave);
      btn.addEventListener("focus", onFocus);
      btn.addEventListener("blur", onBlur);

      cleanups.push(() => {
        btn.removeEventListener("pointerenter", onEnter);
        btn.removeEventListener("pointerleave", onLeave);
        btn.removeEventListener("focus", onFocus);
        btn.removeEventListener("blur", onBlur);
      });
    });

    return () => cleanups.forEach((fn) => fn());
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
