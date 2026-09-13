import { extractStyleDNAFromTexts, StyleDNAMetrics } from "../styleDNA/extract";

export interface VoiceMatchDimension {
  name: string;
  score: number; // 0 to 100
  target: number | string;
  measured: number | string;
  weight: number;
  details: string;
}

export interface VoiceMatchReport {
  overallScore: number; // 0 to 100
  dimensions: {
    sentenceLength: VoiceMatchDimension;
    clauseDensity: VoiceMatchDimension;
    transitionSimilarity: VoiceMatchDimension;
    clarificationSimilarity: VoiceMatchDimension;
    punctuationSimilarity: VoiceMatchDimension;
    workflowSimilarity: VoiceMatchDimension;
  };
  summary: string;
}

/**
 * Calculates a bounded similarity percentage (0-100%) between measured and target values.
 */
function calculateBoundedSimilarity(measured: number | null, target: number | null, fallbackScale: number = 1.0): number {
  if (measured === null && target === null) return 100;
  if (measured === null || target === null) return 70; // Partial match if target unavailable

  if (target === 0 && measured === 0) return 100;

  const baseScale = Math.max(fallbackScale, Math.abs(target));
  const diffRatio = Math.abs(measured - target) / baseScale;
  const score = Math.max(0, Math.min(100, Math.round((1 - diffRatio) * 100)));

  if (Number.isNaN(score) || !Number.isFinite(score)) return 75;
  return score;
}

/**
 * Computes deterministic Voice Match score comparing rewritten output against
 * the user's own VoiceDNA profile across 6 exact dimensions:
 * 1. sentence length similarity
 * 2. clause density
 * 3. transition similarity
 * 4. clarification similarity
 * 5. punctuation similarity
 * 6. workflow similarity
 *
 * Never compares against AI detectors. Compares exclusively against the user's profile.
 */
export function computeVoiceMatch(
  rewrittenOutput: string,
  targetProfile: { metrics?: StyleDNAMetrics } | StyleDNAMetrics | null
): VoiceMatchReport {
  // If empty output or no profile, return fallback
  if (!rewrittenOutput || !rewrittenOutput.trim()) {
    return getEmptyVoiceMatchReport();
  }

  const metricsTarget: StyleDNAMetrics | null =
    (targetProfile as any)?.metrics || (targetProfile as StyleDNAMetrics) || null;

  // Compute deterministic stylometric metrics on the actual rewritten output
  const outputMetrics = extractStyleDNAFromTexts([rewrittenOutput]);

  // 1. Sentence Length Similarity (Weight: 25%)
  const targetAvgLen = metricsTarget?.sentenceLength?.averageWords ?? 30.0;
  const measuredAvgLen = outputMetrics.sentenceLength.averageWords ?? 25.0;
  const scoreSentenceLength = calculateBoundedSimilarity(measuredAvgLen, targetAvgLen, 10.0);

  // 2. Clause Density Similarity (Weight: 15%)
  const targetClause = metricsTarget?.clauseDensity?.averageClausesPerSentence ?? 2.5;
  const measuredClause = outputMetrics.clauseDensity.averageClausesPerSentence ?? 2.0;
  const scoreClauseDensity = calculateBoundedSimilarity(measuredClause, targetClause, 1.0);

  // 3. Transition Similarity (Weight: 15%)
  const targetTrans = metricsTarget?.transitionFrequency?.densityPer100Words ?? 5.0;
  const measuredTrans = outputMetrics.transitionFrequency.densityPer100Words ?? 4.0;
  const scoreTransition = calculateBoundedSimilarity(measuredTrans, targetTrans, 2.0);

  // 4. Clarification Similarity (Weight: 15%)
  const targetClarif = metricsTarget?.clarificationFrequency?.densityPer100Words ?? 0.2;
  const measuredClarif = outputMetrics.clarificationFrequency.densityPer100Words ?? 0.1;
  const scoreClarification = calculateBoundedSimilarity(measuredClarif, targetClarif, 0.5);

  // 5. Punctuation Similarity (Weight: 15%)
  const targetPunc = metricsTarget?.punctuationHabits;
  const outputPunc = outputMetrics.punctuationHabits;
  const semiScore = calculateBoundedSimilarity(outputPunc.semicolonsPer100Words, targetPunc?.semicolonsPer100Words ?? 0.1, 0.2);
  const parenScore = calculateBoundedSimilarity(outputPunc.parenthesesPer100Words, targetPunc?.parenthesesPer100Words ?? 0.5, 0.5);
  const colonScore = calculateBoundedSimilarity(outputPunc.colonsPer100Words, targetPunc?.colonsPer100Words ?? 0.2, 0.3);
  const scorePunctuation = Math.round((semiScore + parenScore + colonScore) / 3);

  // 6. Workflow Similarity (Weight: 15%)
  const targetWorkflow = metricsTarget?.workflowExplanationTendency?.tendencyScore ?? 25;
  const measuredWorkflow = outputMetrics.workflowExplanationTendency.tendencyScore ?? 20;
  const scoreWorkflow = calculateBoundedSimilarity(measuredWorkflow, targetWorkflow, 20);

  // Overall Weighted Score
  const overallScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        scoreSentenceLength * 0.25 +
        scoreClauseDensity * 0.15 +
        scoreTransition * 0.15 +
        scoreClarification * 0.15 +
        scorePunctuation * 0.15 +
        scoreWorkflow * 0.15
      )
    )
  );

  return {
    overallScore,
    dimensions: {
      sentenceLength: {
        name: "Sentence Cadence",
        score: scoreSentenceLength,
        target: `${targetAvgLen} words/sent`,
        measured: `${measuredAvgLen} words/sent`,
        weight: 0.25,
        details: `Target: ~${Math.round(targetAvgLen)} words/sentence. Measured: ~${Math.round(measuredAvgLen)} words/sentence.`,
      },
      clauseDensity: {
        name: "Clause Density",
        score: scoreClauseDensity,
        target: `${targetClause} clauses/sent`,
        measured: `${measuredClause} clauses/sent`,
        weight: 0.15,
        details: `Subordinate and compound clause complexity matching target ${targetClause} clauses/sentence.`,
      },
      transitionSimilarity: {
        name: "Transitional Flow",
        score: scoreTransition,
        target: `${targetTrans} / 100w`,
        measured: `${measuredTrans} / 100w`,
        weight: 0.15,
        details: `Transitional signpost pacing matching profile density of ${targetTrans} connectors/100w.`,
      },
      clarificationSimilarity: {
        name: "Clarification Habits",
        score: scoreClarification,
        target: `${targetClarif} / 100w`,
        measured: `${measuredClarif} / 100w`,
        weight: 0.15,
        details: `Immediate grounding definition rate matching target ${targetClarif} markers/100w.`,
      },
      punctuationSimilarity: {
        name: "Punctuation Habits",
        score: scorePunctuation,
        target: "Profile baseline",
        measured: `Semi: ${outputPunc.semicolonsPer100Words ?? 0}, Paren: ${outputPunc.parenthesesPer100Words ?? 0}`,
        weight: 0.15,
        details: "Syntactic coordination using semicolons, colons, and qualifying parentheses.",
      },
      workflowSimilarity: {
        name: "Workflow Sequence",
        score: scoreWorkflow,
        target: `${targetWorkflow}/100`,
        measured: `${measuredWorkflow}/100`,
        weight: 0.15,
        details: `Procedural explanatory progression matching target score ${targetWorkflow}/100.`,
      },
    },
    summary:
      overallScore >= 85
        ? "Exceptional alignment with personal VoiceDNA writing archetype."
        : overallScore >= 70
        ? "Solid alignment with personal academic voice cadence and structure."
        : "Moderate stylistic variance; consider adjusting sentence cadence or transitional connectors.",
  };
}

function getEmptyVoiceMatchReport(): VoiceMatchReport {
  return {
    overallScore: 0,
    dimensions: {
      sentenceLength: { name: "Sentence Cadence", score: 0, target: "—", measured: "—", weight: 0.25, details: "No text analyzed" },
      clauseDensity: { name: "Clause Density", score: 0, target: "—", measured: "—", weight: 0.15, details: "No text analyzed" },
      transitionSimilarity: { name: "Transitional Flow", score: 0, target: "—", measured: "—", weight: 0.15, details: "No text analyzed" },
      clarificationSimilarity: { name: "Clarification Habits", score: 0, target: "—", measured: "—", weight: 0.15, details: "No text analyzed" },
      punctuationSimilarity: { name: "Punctuation Habits", score: 0, target: "—", measured: "—", weight: 0.15, details: "No text analyzed" },
      workflowSimilarity: { name: "Workflow Sequence", score: 0, target: "—", measured: "—", weight: 0.15, details: "No text analyzed" },
    },
    summary: "Awaiting text transformation to evaluate Voice Match against profile.",
  };
}
