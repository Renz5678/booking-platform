import * as Sentry from "@sentry/nextjs";

Sentry.init({
  beforeSend(event) {
    delete event.user;
    delete event.breadcrumbs;
    delete event.extra;
    if (event.request) event.request = { method: event.request.method, url: event.request.url?.split("?")[0] };
    for (const exception of event.exception?.values || []) exception.value = exception.type || "Application error";
    return event;
  },
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  tracesSampleRate: 1.0,
  debug: false,
});
