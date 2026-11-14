import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex flex-1 items-center bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-container-max px-4 md:px-margin-desktop w-full">
        <div className="max-w-2xl border-l-2 border-secondary pl-6 sm:pl-8">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary tabular-nums">
            404 &bull; Quiet Room
          </p>
          <h1 className="mt-3 font-serif text-headline-xl text-primary">
            This room is empty, but you are in the right place.
          </h1>
          <p className="mt-4 text-body-lg text-on-surface-variant">
            The page you were looking for has moved or does not exist. You can
            return to the front room or browse our licensed counselors.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/"
              data-fill
              className="btn-fill inline-flex min-h-[44px] items-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
            >
              <span className="btn__fill" aria-hidden="true" />
              <span>Return Home</span>
            </Link>
            <Link
              href="/counselors"
              className="inline-link inline-flex min-h-[44px] items-center py-2 text-sm font-semibold text-primary"
            >
              Browse Counselors
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
