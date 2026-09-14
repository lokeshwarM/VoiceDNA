import { NextRequest, NextResponse } from "next/server";
import { deleteDocument, getAllDocuments, getPersonalDocuments, updateVoiceProfile } from "@/lib/db/queries";
import { synthesizeVoiceProfileFromDocs } from "@/lib/styleDNA/extract";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    deleteDocument(id);

    // Recalibrate voice profile with remaining personal documents
    const remainingPersonal = getPersonalDocuments();
    const remainingAll = getAllDocuments();
    const updatedProfile = synthesizeVoiceProfileFromDocs(
      remainingPersonal.length > 0 ? remainingPersonal : remainingAll
    );

    if (updatedProfile) {
      const db = getDb();
      const existing = db.prepare("SELECT id FROM voice_profiles WHERE is_active = 1 LIMIT 1").get() as any;
      if (existing) {
        updateVoiceProfile({ ...updatedProfile, id: existing.id });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully.",
      voiceProfile: updatedProfile,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
