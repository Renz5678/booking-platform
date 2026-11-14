import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").origin;
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://res.cloudinary.com https://www.google.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ${apiOrigin} https://*.ingest.sentry.io https://www.google.com https://www.gstatic.com; frame-src https://www.google.com https://recaptcha.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
