import { NextRequest, NextResponse } from "next/server";
import { learnFromManualEdits } from "@/lib/ai/learning-loop";
import { updateRewriteUserText } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalOutput, userEditedText, rewriteId } = body;

    if (!originalOutput || !userEditedText) {
      return NextResponse.json(
        { success: false, error: "Both original output and user edited text are required." },
        { status: 400 }
      );
    }

    if (originalOutput.trim() === userEditedText.trim()) {
      return NextResponse.json(
        { success: false, error: "No changes detected between the AI output and your text." },
        { status: 400 }
      );
    }

    // Learn from the edit differences
    const result = await learnFromManualEdits(originalOutput, userEditedText, rewriteId);

    // Update history record if rewriteId is provided
    if (rewriteId) {
      updateRewriteUserText(rewriteId, userEditedText);
    }

    return NextResponse.json({
      success: true,
      rule: result.rule,
      diffSummary: result.diffSummary,
      structuralChanges: result.structuralChanges,
      fingerprintRebuilt: result.fingerprintRebuilt,
      totalEditsCount: result.totalEditsCount,
      message: `Style rule learned & VoiceDNA profile rebuilt from manual edit: "${result.rule.rule_text}"`,
    });
  } catch (err: any) {
    console.error("Learn edits error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
