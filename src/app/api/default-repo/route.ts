import { NextResponse } from "next/server";

/** Returns the default repo path from env so the client can show it without relying on NEXT_PUBLIC_ inlining. */
export async function GET() {
  const repo = (process.env.NEXT_PUBLIC_DEFAULT_REPO ?? "").trim();
  return NextResponse.json({ repo });
}
