import { NextResponse } from "next/server";
import { getAllDocuments, updateVoiceProfile, getActiveVoiceProfile } from "@/lib/db/queries";
import { synthesizeVoiceProfileFromDocs } from "@/lib/styleDNA/extract";
import { rebuildVoiceDNA } from "@/lib/styleDNA/corpus";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allDocs = getAllDocuments();
    let updatedProfile = synthesizeVoiceProfileFromDocs(allDocs);

    // Also trigger corpus rebuild if data/corpus has files
    try {
      const corpusResult = await rebuildVoiceDNA();
      if (corpusResult && corpusResult.summary.totalWords > 0) {
        const db = getDb();
        const existing = db.prepare("SELECT id FROM voice_profiles WHERE is_active = 1 LIMIT 1").get() as any;
        const profileId = existing ? existing.id : "default-profile";

        const synthesizedGuidelines = `# Calibrated VoiceDNA Guidelines
${corpusResult.fingerprintRules.map((r) => `- ${r}`).join("\n")}

## Measurable Quantitative Habits:
- Average Sentence Length: ${corpusResult.metrics.sentenceLength.averageWords} words
- Clause Density: ${corpusResult.metrics.clauseDensity.averageClausesPerSentence} clauses/sentence
- Clarification Frequency: ${corpusResult.metrics.clarificationFrequency.densityPer100Words} markers / 100 words
- Transition Density: ${corpusResult.metrics.transitionFrequency.densityPer100Words} per 100 words
- Lexical Type-Token Ratio: ${corpusResult.metrics.vocabularyRepetition.typeTokenRatio}
- Workflow Explanation Score: ${corpusResult.metrics.workflowExplanationTendency.tendencyScore}/100`;

        const newProf = {
          id: profileId,
          name: "Learned Academic Voice Profile",
          is_active: 1,
          tone_descriptors: ["Analytical", "Precision-Oriented", "Objective"],
          sentence_cadence: corpusResult.metrics.sentenceLength,
          preferred_transitions: corpusResult.metrics.transitionFrequency.topTransitions.map((t) => t.word),
          rhetorical_habits: [
            "Frames theoretical context before empirical evidence",
            "Employs disciplined epistemic hedging",
            "Maintains scholarly syntactic cadence",
          ],
          synthesized_guidelines: synthesizedGuidelines,
          profile_json: JSON.stringify(corpusResult.metrics, null, 2),
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          updateVoiceProfile(newProf);
        } else {
          db.prepare(`
            INSERT INTO voice_profiles (
              id, name, is_active, tone_descriptors, sentence_cadence,
              preferred_transitions, rhetorical_habits, synthesized_guidelines, profile_json, updated_at
            ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newProf.id,
            newProf.name,
            JSON.stringify(newProf.tone_descriptors),
            JSON.stringify(newProf.sentence_cadence),
            JSON.stringify(newProf.preferred_transitions),
            JSON.stringify(newProf.rhetorical_habits),
            newProf.synthesized_guidelines,
            newProf.profile_json,
            newProf.updated_at
          );
        }

        updatedProfile = {
          ...newProf,
          unified_profile: {
            version: "2.0",
            status: "Voice Learned",
            updatedAt: new Date().toISOString(),
            corpusSummary: {
              totalDocuments: corpusResult.summary.totalFiles,
              totalWords: corpusResult.summary.totalWords,
              totalSentences: corpusResult.summary.totalSentences,
              totalParagraphs: corpusResult.metrics.paragraphLength.totalParagraphs,
            },
            metrics: corpusResult.metrics,
          },
        };
      }
    } catch (cErr: any) {
      console.warn("Corpus rebuild warning in /api/voice/rebuild:", cErr.message);
    }

    const hasProfile = Boolean(updatedProfile);
    return NextResponse.json({
      success: true,
      status: hasProfile ? "Voice Learned" : "Awaiting Training Documents",
      profile: updatedProfile,
      profileJson: updatedProfile?.unified_profile || (updatedProfile?.profile_json ? JSON.parse(updatedProfile.profile_json) : null),
      message: hasProfile
        ? "Voice Learned: Profile successfully recalibrated."
        : "No training documents found. Ingest documents in Corpus Manager.",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
