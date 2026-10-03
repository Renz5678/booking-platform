import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Silence the Turbopack/webpack conflict that Sentry's withSentryConfig introduces.
  // Sentry doesn't fully support Turbopack yet — instrumentation still works in
  // production builds (which use webpack). In dev, source maps / tracing won't be
  // uploaded but the app will work fine.
  turbopack: {},
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "alaga",
  project: "alaga-frontend",
});
