import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  
  if (code && state) {
    // Forward to backend which handles the token exchange and db save
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return NextResponse.redirect(`${apiUrl}/auth/google/callback?code=${code}&state=${state}`);
  }
  
  // Fallback if missing params
  return NextResponse.redirect(new URL('/counselor/dashboard', request.url));
}
