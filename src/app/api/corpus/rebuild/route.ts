import { NextResponse } from "next/server";
import { rebuildVoiceDNA } from "@/lib/styleDNA/corpus";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await rebuildVoiceDNA();

    // Also update active voice profile in SQLite with the generated guidelines so existing UI is synchronized
    try {
      const db = getDb();
      const profileRow = db.prepare("SELECT id FROM voice_profiles WHERE is_active = 1 LIMIT 1").get() as any;
      if (profileRow) {
        const synthesizedGuidelines = `# Calibrated VoiceDNA Guidelines
${result.fingerprintRules.map((r) => `- ${r}`).join("\n")}

## Measurable Quantitative Habits:
- Average Sentence Length: ${result.metrics.sentenceLength.averageWords} words
- Clause Density: ${result.metrics.clauseDensity.averageClausesPerSentence} clauses/sentence
- Clarification Frequency: ${result.metrics.clarificationFrequency.densityPer100Words} markers / 100 words
- Transition Density: ${result.metrics.transitionFrequency.densityPer100Words} per 100 words
- Lexical Type-Token Ratio: ${result.metrics.vocabularyRepetition.typeTokenRatio}
- Workflow Explanation Score: ${result.metrics.workflowExplanationTendency.tendencyScore}/100`;

        db.prepare(
          `UPDATE voice_profiles 
           SET synthesized_guidelines = ?, 
               profile_json = ?, 
               updated_at = ? 
           WHERE id = ?`
        ).run(
          synthesizedGuidelines,
          JSON.stringify(result.metrics),
          new Date().toISOString(),
          profileRow.id
        );
      }
    } catch (dbErr: any) {
      console.warn("Could not sync SQLite voice_profiles with voiceDNA.json:", dbErr.message);
    }

    return NextResponse.json({
      success: true,
      metrics: result.metrics,
      fingerprintRules: result.fingerprintRules,
      summary: result.summary,
      message: `VoiceDNA successfully rebuilt from ${result.summary.totalFiles} corpus files (${result.summary.totalWords.toLocaleString()} words).`,
    });
  } catch (err: any) {
    console.error("Error rebuilding VoiceDNA:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
