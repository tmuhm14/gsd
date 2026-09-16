import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

const schema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  if (!verifyPassword(parsed.data.password)) {
    // Deliberately vague, and no hint about which part was wrong.
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const session = await getSession();
  session.signedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
