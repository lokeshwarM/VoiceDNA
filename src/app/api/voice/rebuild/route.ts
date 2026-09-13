import { NextResponse } from "next/server";
import { getAllDocuments } from "@/lib/db/queries";
import { synthesizeVoiceProfile } from "@/lib/ai/style-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allDocs = getAllDocuments();
    const updatedProfile = await synthesizeVoiceProfile(allDocs);

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      message: `Voice DNA rebuilt from ${allDocs.length} documents.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
