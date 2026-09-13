import { NextResponse } from "next/server";
import { getRecentRewrites } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rewrites = getRecentRewrites(15);
    return NextResponse.json({ success: true, rewrites });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
