import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const EchoSchema = z.object({ message: z.string() });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = EchoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, received: { message: parsed.data.message } });
}
