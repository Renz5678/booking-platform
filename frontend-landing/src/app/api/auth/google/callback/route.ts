import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  
  if (code && state) {
    // Forward to backend which handles the token exchange and db save
    return NextResponse.redirect(`http://localhost:8000/auth/google/callback?code=${code}&state=${state}`);
  }
  
  // Fallback if missing params
  return NextResponse.redirect(new URL('/counselor/dashboard', request.url));
}
