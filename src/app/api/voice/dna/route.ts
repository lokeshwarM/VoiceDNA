import { NextResponse } from "next/server";
import { getActiveVoiceProfile, getAllDocuments, getActiveLearnedRules } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = getActiveVoiceProfile();
    const documents = getAllDocuments();
    const rules = getActiveLearnedRules();

    const totalWords = documents.reduce((acc, d) => acc + d.word_count, 0);

    return NextResponse.json({
      success: true,
      profile,
      stats: {
        documentCount: documents.length,
        totalWordsAnalyzed: totalWords,
        activeRulesCount: rules.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
