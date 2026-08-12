import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (code && state) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return NextResponse.redirect(
      `${apiUrl}/auth/google/client/callback?code=${code}&state=${state}`
    );
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
