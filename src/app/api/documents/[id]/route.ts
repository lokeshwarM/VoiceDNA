import { NextRequest, NextResponse } from "next/server";
import { deleteDocument, getAllDocuments } from "@/lib/db/queries";
import { synthesizeVoiceProfile } from "@/lib/ai/style-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    deleteDocument(id);

    // Recalibrate voice profile with remaining documents
    const remainingDocs = getAllDocuments();
    const updatedProfile = await synthesizeVoiceProfile(remainingDocs);

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully.",
      voiceProfile: updatedProfile,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
