import fs from "fs";
import path from "path";
import { StyleDNAMetrics } from "./extract";

/**
 * Loads data/profile/voiceDNA.json from disk and converts it into reusable fingerprint rules.
 * Does NOT store or return previous sentences — only generates generative style directives.
 */
export function getFingerprintRules(metricsOverride?: StyleDNAMetrics): string[] {
  let metrics: StyleDNAMetrics;

  if (metricsOverride) {
    metrics = metricsOverride;
  } else {
    try {
      const profilePath = path.join(process.cwd(), "data", "profile", "voiceDNA.json");
      if (fs.existsSync(profilePath)) {
        metrics = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
      } else {
        metrics = getDefaultMetrics();
      }
    } catch (err) {
      console.warn("Could not load voiceDNA.json, using defaults:", err);
      metrics = getDefaultMetrics();
    }
  }

  const rules: string[] = [];

  // 1. Sentence Cadence Rule
  const avgLen = metrics.sentenceLength.averageWords;
  if (avgLen <= 16) {
    rules.push("keeps compact, direct sentence length (averaging ~14-16 words); avoids runaway compound sentences");
  } else if (avgLen >= 26) {
    rules.push(`constructs expansive academic sentences (averaging ~${Math.round(avgLen)} words), developing multi-part reasoning before concluding`);
  } else {
    rules.push(`keeps moderate sentence length (averaging ~${Math.round(avgLen)} words), alternating concise declarative claims with detailed elaborations`);
  }

  // 2. Thought Development / Paragraph Expansion Rule
  const avgParaSentences = metrics.paragraphLength.averageSentences;
  if (avgParaSentences >= 4) {
    rules.push("expands thoughts before concluding; develops propositions with explanatory context and implications rather than abrupt stops");
  } else {
    rules.push("maintains tight, modular paragraphs focused squarely on a single discrete concept");
  }

  // 3. Workflow & Sequential Explanation Rule
  const workflowScore = metrics.workflowExplanationTendency.tendencyScore;
  if (workflowScore >= 35) {
    rules.push("prefers sequential explanations; structures explanations with logical progression (e.g. initial setup -> mechanism -> outcome)");
  }

  // 4. Clarification Tendency Rule
  const clarifDensity = metrics.clarificationFrequency.densityPer100Words;
  if (clarifDensity >= 0.1 || metrics.clarificationFrequency.totalClarifications > 0) {
    rules.push("uses clarification after introducing ideas (e.g. 'specifically', 'that is', 'meaning that', 'for example') to ground theoretical statements");
  }

  // 5. Clause Density & Subordination Rule
  const clauseDensity = metrics.clauseDensity.averageClausesPerSentence;
  if (clauseDensity >= 1.7) {
    rules.push("favors multi-clause compound sentences with qualifying subordinate clauses (e.g. 'provided that', 'whereas', 'because')");
  } else {
    rules.push("prefers streamlined syntactic construction with linear, un-nested clauses");
  }

  // 6. Vocabulary & Diction Discipline Rule
  const ttr = metrics.vocabularyRepetition.typeTokenRatio;
  if (ttr >= 0.35) {
    rules.push("avoids ornamental vocabulary; employs precise, unpretentious domain diction with consistent terminology");
  } else {
    rules.push("utilizes focused recurring domain terms for conceptual consistency");
  }

  // 7. Transition Signature Rule
  const ratios = metrics.transitionFrequency.categoryRatios;
  if (ratios.causal >= 30) {
    rules.push("favors causal transitional signposts (e.g. 'consequently', 'therefore', 'thus') to underscore results and logical deductions");
  } else if (ratios.adversative >= 30) {
    rules.push("favors contrastive transitions (e.g. 'however', 'in contrast', 'conversely') to frame analytical counter-perspectives");
  } else {
    rules.push("uses disciplined transitional connectors to signpost shifts in argumentation without over-saturating prose");
  }

  // 8. Punctuation Signature Rule
  const punc = metrics.punctuationHabits;
  if (punc.semicolonsPer100Words >= 0.15) {
    rules.push("uses semicolons to connect logically interdependent propositions");
  }
  if (punc.parenthesesPer100Words >= 0.3) {
    rules.push("uses parenthetical qualifiers to provide concise supplementary nuance");
  }
  if (punc.emDashesPer100Words >= 0.15) {
    rules.push("employs em-dashes for appositive emphasis or parenthetical interjections");
  }

  return rules;
}

function getDefaultMetrics(): StyleDNAMetrics {
  return {
    corpusSummary: { totalFiles: 1, totalWords: 1000, totalSentences: 45, totalParagraphs: 8 },
    sentenceLength: {
      averageWords: 22.4,
      medianWords: 21,
      minWords: 6,
      maxWords: 38,
      stdDev: 6.2,
      distribution: { shortPercent: 20, mediumPercent: 60, longPercent: 20 },
    },
    clauseDensity: { averageClausesPerSentence: 1.8, subordinateClauseRatio: 0.55, coordinationRatio: 0.25 },
    paragraphLength: { averageSentences: 5.2, averageWords: 110, totalParagraphs: 8 },
    transitionFrequency: {
      densityPer100Words: 2.3,
      categoryRatios: { causal: 35, adversative: 25, additive: 20, sequential: 12, emphasis: 8 },
      topTransitions: [{ word: "consequently", count: 8 }, { word: "furthermore", count: 6 }],
    },
    clarificationFrequency: {
      densityPer100Words: 0.35,
      occurrencesPer10Sentences: 0.8,
      totalClarifications: 4,
      topMarkers: [{ marker: "specifically", count: 3 }],
    },
    punctuationHabits: {
      semicolonsPer100Words: 0.22,
      colonsPer100Words: 0.12,
      emDashesPer100Words: 0.18,
      parenthesesPer100Words: 0.45,
      commasPer100Words: 4.8,
      quotesPer100Words: 0.15,
      questionsPer100Sentences: 0.2,
    },
    vocabularyRepetition: { typeTokenRatio: 0.48, lexicalRedundancy: 0.52, hapaxLegomenaRatio: 0.51 },
    workflowExplanationTendency: { densityPer100Words: 2.1, proceduralMarkerCount: 14, tendencyScore: 52 },
    timestamp: new Date().toISOString(),
  };
}
