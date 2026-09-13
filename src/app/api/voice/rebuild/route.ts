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
      status: "Voice Learned",
      profile: updatedProfile,
      profileJson: updatedProfile.unified_profile || (updatedProfile.profile_json ? JSON.parse(updatedProfile.profile_json) : null),
      message: `Voice Learned: Profile successfully rebuilt from ${allDocs.length} documents.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
