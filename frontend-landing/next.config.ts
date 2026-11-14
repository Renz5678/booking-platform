import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Silence the Turbopack/webpack conflict that Sentry's withSentryConfig introduces.
  // Sentry doesn't fully support Turbopack yet — instrumentation still works in
  // production builds (which use webpack). In dev, source maps / tracing won't be
  // uploaded but the app will work fine.
  turbopack: {},
  experimental: { useTypeScriptCli: false },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
    ] }];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  org: "alaga",
  project: "alaga-frontend",
});
