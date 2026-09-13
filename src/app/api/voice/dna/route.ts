import { NextResponse } from "next/server";
import { getActiveVoiceProfile, getAllDocuments, getActiveLearnedRules } from "@/lib/db/queries";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = getActiveVoiceProfile();
    const documents = getAllDocuments();
    const rules = getActiveLearnedRules();

    const totalWords = documents.reduce((acc, d) => acc + d.word_count, 0);

    const profileDir = path.join(process.cwd(), "data", "profile");
    const profileJsonPath = path.join(profileDir, "voiceDNA.json");
    let diskMetrics: any = null;
    if (fs.existsSync(profileJsonPath)) {
      try {
        diskMetrics = JSON.parse(fs.readFileSync(profileJsonPath, "utf-8"));
      } catch {}
    }

    const hasLearnedVoice =
      (diskMetrics && diskMetrics.corpusSummary && diskMetrics.corpusSummary.totalWords > 0) ||
      totalWords > 0;

    const profileJson =
      diskMetrics ||
      profile?.unified_profile ||
      (profile?.profile_json ? JSON.parse(profile.profile_json) : null);

    const corpusWords = diskMetrics?.corpusSummary?.totalWords || totalWords;
    const docCount = diskMetrics?.corpusSummary?.totalFiles || documents.length;

    const finalProfile = profile
      ? {
          ...profile,
          profile_json: JSON.stringify(diskMetrics || profileJson),
          unified_profile: diskMetrics || profileJson,
        }
      : {
          id: "default-voice",
          name: "Personal Academic VoiceDNA",
          is_active: 1,
          tone_descriptors: ["Analytical", "Precision-Oriented", "Objective"],
          sentence_cadence: {},
          preferred_transitions: [],
          rhetorical_habits: [],
          synthesized_guidelines: "",
          profile_json: JSON.stringify(diskMetrics || profileJson),
          unified_profile: diskMetrics || profileJson,
          updated_at: new Date().toISOString(),
        };

    return NextResponse.json({
      success: true,
      status: hasLearnedVoice ? "Voice Learned" : "Awaiting Training Documents",
      profile: finalProfile,
      profileJson,
      stats: {
        documentCount: docCount,
        totalWordsAnalyzed: corpusWords,
        activeRulesCount: rules.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
