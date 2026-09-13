import fs from "fs";
import path from "path";
import { StyleDNAMetrics } from "./extract";

/**
 * Loads data/profile/voiceDNA.json from disk and converts it into reusable fingerprint rules.
 * Does NOT store or return previous sentences — only generates generative style directives.
 * Returns empty array if no profile or documents exist.
 */
export function getFingerprintRules(metricsOverride?: StyleDNAMetrics): string[] {
  let metrics: StyleDNAMetrics | null = null;

  if (metricsOverride) {
    metrics = metricsOverride;
  } else {
    try {
      const profilePath = path.join(process.cwd(), "data", "profile", "voiceDNA.json");
      if (fs.existsSync(profilePath)) {
        metrics = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
      }
    } catch (err) {
      console.warn("Could not load voiceDNA.json:", err);
      return [];
    }
  }

  // If no metrics or no words analyzed, return empty rules
  if (!metrics || !metrics.corpusSummary || metrics.corpusSummary.totalWords === 0) {
    return [];
  }

  const rules: string[] = [];

  // 1. Sentence Cadence Rule
  const avgLen = metrics.sentenceLength.averageWords;
  if (avgLen !== null && avgLen > 0) {
    if (avgLen <= 16) {
      rules.push("keeps compact, direct sentence length (averaging ~14-16 words); avoids runaway compound sentences");
    } else if (avgLen >= 26) {
      rules.push(`constructs expansive academic sentences (averaging ~${Math.round(avgLen)} words), developing multi-part reasoning before concluding`);
    } else {
      rules.push(`keeps moderate sentence length (averaging ~${Math.round(avgLen)} words), alternating concise declarative claims with detailed elaborations`);
    }
  }

  // 2. Thought Development / Paragraph Expansion Rule
  const avgParaSentences = metrics.paragraphLength.averageSentences;
  if (avgParaSentences !== null && avgParaSentences >= 4) {
    rules.push("expands thoughts before concluding; develops propositions with explanatory context and implications rather than abrupt stops");
  } else if (avgParaSentences !== null && avgParaSentences > 0) {
    rules.push("maintains tight, modular paragraphs focused squarely on a single discrete concept");
  }

  // 3. Workflow & Sequential Explanation Rule
  const workflowScore = metrics.workflowExplanationTendency.tendencyScore;
  if (workflowScore !== null && workflowScore >= 35) {
    rules.push("prefers sequential explanations; structures explanations with logical progression (e.g. initial setup -> mechanism -> outcome)");
  }

  // 4. Clarification Tendency Rule
  const clarifDensity = metrics.clarificationFrequency.densityPer100Words;
  if ((clarifDensity !== null && clarifDensity >= 0.1) || metrics.clarificationFrequency.totalClarifications > 0) {
    rules.push("uses clarification after introducing ideas (e.g. 'specifically', 'that is', 'meaning that', 'for example') to ground theoretical statements");
  }

  // 5. Clause Density & Subordination Rule
  const clauseDensity = metrics.clauseDensity.averageClausesPerSentence;
  if (clauseDensity !== null && clauseDensity >= 1.7) {
    rules.push("favors multi-clause compound sentences with qualifying subordinate clauses (e.g. 'provided that', 'whereas', 'because')");
  } else if (clauseDensity !== null && clauseDensity > 0) {
    rules.push("prefers streamlined syntactic construction with linear, un-nested clauses");
  }

  // 6. Vocabulary & Diction Discipline Rule
  const ttr = metrics.vocabularyRepetition.typeTokenRatio;
  if (ttr !== null && ttr >= 0.35) {
    rules.push("avoids ornamental vocabulary; employs precise, unpretentious domain diction with consistent terminology");
  } else if (ttr !== null && ttr > 0) {
    rules.push("utilizes focused recurring domain terms for conceptual consistency");
  }

  // 7. Transition Signature Rule
  const ratios = metrics.transitionFrequency.categoryRatios;
  if (ratios.causal >= 30) {
    rules.push("favors causal transitional signposts (e.g. 'consequently', 'therefore', 'thus') to underscore results and logical deductions");
  } else if (ratios.adversative >= 30) {
    rules.push("favors contrastive transitions (e.g. 'however', 'in contrast', 'conversely') to frame analytical counter-perspectives");
  } else if (metrics.transitionFrequency.densityPer100Words !== null && metrics.transitionFrequency.densityPer100Words > 0) {
    rules.push("uses disciplined transitional connectors to signpost shifts in argumentation without over-saturating prose");
  }

  // 8. Punctuation Signature Rule
  const punc = metrics.punctuationHabits;
  if (punc.semicolonsPer100Words !== null && punc.semicolonsPer100Words >= 0.15) {
    rules.push("uses semicolons to connect logically interdependent propositions");
  }
  if (punc.parenthesesPer100Words !== null && punc.parenthesesPer100Words >= 0.3) {
    rules.push("uses parenthetical qualifiers to provide concise supplementary nuance");
  }
  if (punc.emDashesPer100Words !== null && punc.emDashesPer100Words >= 0.15) {
    rules.push("employs em-dashes for appositive emphasis or parenthetical interjections");
  }

  return rules;
}
