import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (code && state) {
    return NextResponse.redirect(
      `http://localhost:8000/auth/google/client/callback?code=${code}&state=${state}`
    );
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
