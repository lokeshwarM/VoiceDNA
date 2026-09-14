import { LexicalFingerprint } from "../styleDNA/lexical-fingerprint";
import { StructuralFingerprint } from "../styleDNA/structural-fingerprint";
import { ProtectedTokenMap } from "./meaning-extractor";

export type TokenChangeClassification =
  | "spelling"
  | "punctuation"
  | "capitalization"
  | "article"
  | "tense"
  | "agreement"
  | "unnecessary_synonym"
  | "transition_inflation"
  | "adjective_inflation"
  | "vocabulary_drift"
  | "other";

export interface TokenChangeDetail {
  original: string;
  replacement: string;
  classification: TokenChangeClassification;
  isAllowed: boolean;
  reason: string;
}

export interface VoiceValidationReport {
  grammarFixesCount: number;
  vocabularyAlignmentPct: number; // e.g. 93%
  structuralAlignmentPct: number; // e.g. 95%
  lexicalDriftPct: number;        // e.g. 4%
  unnecessarySynonymCount: number; // e.g. 2
  unnecessarySynonymSwaps: { original: string; replacement: string }[];
  flaggedTransitions: string[];
  flaggedAdjectives: string[];
  tokenChanges: TokenChangeDetail[];
  isPass: boolean;
  enforcementVerdict: "Passed — Authentic Voice Preserved" | "Warning — Lexical Drift Detected" | "Failed — Generic Academic Normalization";
  summary: string;
}

/**
 * Common inflated academic synonyms that strip authorial identity.
 */
const KNOWN_SYNONYM_INFLATIONS: Record<string, string[]> = {
  provide: ["offer", "furnish", "render"],
  large: ["significant", "substantial", "considerable"],
  combine: ["integrate", "amalgamate", "synthesize"],
  reduce: ["mitigate", "curtail", "attenuate", "diminish"],
  show: ["demonstrate", "exhibit", "manifest", "illustrate"],
  use: ["utilize", "deploy", "employ", "leverage"],
  help: ["facilitate", "assist", "aid"],
  keep: ["preserve", "retain", "maintain"],
  problem: ["challenge", "impediment", "obstacle"],
  method: ["framework", "paradigm", "methodology"],
  good: ["effective", "optimal", "efficacious"],
  start: ["initiate", "commence"],
  stop: ["terminate", "cease"],
  check: ["verify", "ascertain"],
};

const FORMAL_TRANSITIONS = new Set([
  "consequently",
  "furthermore",
  "moreover",
  "therefore",
  "thus",
  "in addition",
  "nevertheless",
  "hence",
  "accordingly",
  "notably",
]);

const INFLATED_ADJECTIVES = new Set([
  "transformative",
  "unprecedented",
  "pivotal",
  "robust",
  "comprehensive",
  "cutting-edge",
  "sophisticated",
  "multifaceted",
  "groundbreaking",
  "rigorous",
]);

const ARTICLES = new Set(["a", "an", "the"]);

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Deterministically classifies a token change from draft input to rewritten output.
 */
function classifyChange(inToken: string, outToken: string): TokenChangeDetail {
  const cleanIn = inToken.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanOut = outToken.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Punctuation only
  if (cleanIn === cleanOut && inToken !== outToken) {
    return {
      original: inToken,
      replacement: outToken,
      classification: "punctuation",
      isAllowed: true,
      reason: "Mechanical punctuation fix",
    };
  }

  // 2. Capitalization only
  if (inToken.toLowerCase() === outToken.toLowerCase()) {
    return {
      original: inToken,
      replacement: outToken,
      classification: "capitalization",
      isAllowed: true,
      reason: "Mechanical capitalization correction",
    };
  }

  // 3. Articles (a, an, the)
  if (ARTICLES.has(cleanIn) || ARTICLES.has(cleanOut)) {
    return {
      original: inToken,
      replacement: outToken,
      classification: "article",
      isAllowed: true,
      reason: "Grammatical article fix",
    };
  }

  // 4. Spelling correction (small Levenshtein distance on words >= 4 chars)
  if (cleanIn.length >= 4 && cleanOut.length >= 4 && levenshteinDistance(cleanIn, cleanOut) <= 2) {
    return {
      original: inToken,
      replacement: outToken,
      classification: "spelling",
      isAllowed: true,
      reason: "Spelling error correction",
    };
  }

  // 5. Tense / Agreement / Morphology (common suffixes: -s, -es, -ed, -ing)
  const stemsMatch =
    cleanIn.startsWith(cleanOut.slice(0, Math.min(cleanIn.length, cleanOut.length) - 2)) ||
    cleanOut.startsWith(cleanIn.slice(0, Math.min(cleanIn.length, cleanOut.length) - 2));

  if (stemsMatch && Math.abs(cleanIn.length - cleanOut.length) <= 3) {
    const isAgreement = (cleanIn.endsWith("s") && !cleanOut.endsWith("s")) || (!cleanIn.endsWith("s") && cleanOut.endsWith("s"));
    return {
      original: inToken,
      replacement: outToken,
      classification: isAgreement ? "agreement" : "tense",
      isAllowed: true,
      reason: isAgreement ? "Subject-verb agreement correction" : "Grammatical tense consistency",
    };
  }

  // 6. Unnecessary Synonym Inflation check
  for (const [nat, synList] of Object.entries(KNOWN_SYNONYM_INFLATIONS)) {
    if (cleanIn === nat && synList.includes(cleanOut)) {
      return {
        original: inToken,
        replacement: outToken,
        classification: "unnecessary_synonym",
        isAllowed: false,
        reason: `Replaced authentic "${cleanIn}" with inflated academic synonym "${cleanOut}"`,
      };
    }
  }

  // 7. Transition inflation check
  if (FORMAL_TRANSITIONS.has(cleanOut) && !FORMAL_TRANSITIONS.has(cleanIn)) {
    return {
      original: inToken,
      replacement: outToken,
      classification: "transition_inflation",
      isAllowed: false,
      reason: `Inserted formal academic transition "${cleanOut}" absent from personal corpus`,
    };
  }

  // 8. Adjective inflation check
  if (INFLATED_ADJECTIVES.has(cleanOut) && !INFLATED_ADJECTIVES.has(cleanIn)) {
    return {
      original: inToken,
      replacement: outToken,
      classification: "adjective_inflation",
      isAllowed: false,
      reason: `Inserted inflated academic descriptor "${cleanOut}"`,
    };
  }

  // 9. General vocabulary shift
  return {
    original: inToken,
    replacement: outToken,
    classification: "vocabulary_drift",
    isAllowed: false,
    reason: `Lexical change from "${inToken}" to "${outToken}"`,
  };
}

/**
 * Deterministic Voice Validator:
 * Evaluates rewritten output against the input text and author's fingerprints.
 * Enforces constraints and classifies every change.
 */
export function validateVoiceTransfer(params: {
  draftInput: string;
  rewrittenOutput: string;
  mode: "exact_voice" | "light_cleanup" | "rewrite" | string;
  lexicalFingerprint?: LexicalFingerprint | null;
  structuralFingerprint?: StructuralFingerprint | null;
  protectedTokens?: ProtectedTokenMap | null;
}): VoiceValidationReport {
  const { draftInput, rewrittenOutput, mode, lexicalFingerprint, structuralFingerprint } = params;

  const inWords = draftInput.trim().split(/\s+/).filter(Boolean);
  const outWords = rewrittenOutput.trim().split(/\s+/).filter(Boolean);

  const minLen = Math.min(inWords.length, outWords.length);
  const tokenChanges: TokenChangeDetail[] = [];

  let grammarFixesCount = 0;
  const unnecessarySynonymSwaps: { original: string; replacement: string }[] = [];
  const flaggedTransitions: string[] = [];
  const flaggedAdjectives: string[] = [];

  for (let i = 0; i < minLen; i++) {
    const inW = inWords[i];
    const outW = outWords[i];

    if (inW !== outW) {
      const detail = classifyChange(inW, outW);
      tokenChanges.push(detail);

      if (detail.isAllowed) {
        grammarFixesCount++;
      } else {
        if (detail.classification === "unnecessary_synonym") {
          unnecessarySynonymSwaps.push({ original: detail.original, replacement: detail.replacement });
        } else if (detail.classification === "transition_inflation") {
          flaggedTransitions.push(detail.replacement);
        } else if (detail.classification === "adjective_inflation") {
          flaggedAdjectives.push(detail.replacement);
        }
      }
    }
  }

  // Also check for inserted formal transitions anywhere in output
  const lowerOutput = rewrittenOutput.toLowerCase();
  for (const ft of FORMAL_TRANSITIONS) {
    const re = new RegExp(`\\b${ft}\\b`, "i");
    if (re.test(lowerOutput) && !re.test(draftInput.toLowerCase())) {
      if (!flaggedTransitions.includes(ft)) {
        flaggedTransitions.push(ft);
      }
    }
  }

  // Also check for inserted inflated adjectives anywhere in output
  for (const adj of INFLATED_ADJECTIVES) {
    const re = new RegExp(`\\b${adj}\\b`, "i");
    if (re.test(lowerOutput) && !re.test(draftInput.toLowerCase())) {
      if (!flaggedAdjectives.includes(adj)) {
        flaggedAdjectives.push(adj);
      }
    }
  }

  // Calculate Vocabulary Alignment (%)
  // Based on the output words matching the author's preferred vocabulary
  let alignedCount = 0;
  const outTokens = lowerOutput.match(/[a-z0-9'-]+/g) || [];
  const totalOutTokens = Math.max(1, outTokens.length);

  for (const tok of outTokens) {
    if (lexicalFingerprint?.verbs && lexicalFingerprint.verbs[tok] !== undefined) {
      alignedCount += lexicalFingerprint.verbs[tok] > 0.5 ? 1 : 0;
    } else if (lexicalFingerprint?.transitions && lexicalFingerprint.transitions[tok] !== undefined) {
      alignedCount += lexicalFingerprint.transitions[tok] > 0.05 ? 1 : 0;
    } else if (!FORMAL_TRANSITIONS.has(tok) && !INFLATED_ADJECTIVES.has(tok)) {
      alignedCount += 0.95; // Neutral domain word is aligned
    }
  }
  const vocabularyAlignmentPct = Math.min(100, Math.max(0, Math.round((alignedCount / totalOutTokens) * 100)));

  // Calculate Structural Alignment (%)
  const outSentences = rewrittenOutput.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
  const avgOutSentLen = outWords.length / Math.max(1, outSentences.length);

  let structuralAlignmentPct = 95;
  if (structuralFingerprint) {
    const [minB, maxB] = structuralFingerprint.sentenceRhythm.naturalRange;
    if (avgOutSentLen >= minB && avgOutSentLen <= maxB) {
      structuralAlignmentPct = 96;
    } else {
      const diff = avgOutSentLen < minB ? minB - avgOutSentLen : avgOutSentLen - maxB;
      structuralAlignmentPct = Math.max(50, Math.round(95 - diff * 2));
    }
  }

  // Calculate Lexical Drift (%)
  const totalFlaggedCount = unnecessarySynonymSwaps.length + flaggedTransitions.length + flaggedAdjectives.length;
  const lexicalDriftPct = Math.min(100, Math.round((totalFlaggedCount / Math.max(1, outWords.length)) * 1000) / 10);

  // Enforcement decision
  let isPass = true;
  let verdict: VoiceValidationReport["enforcementVerdict"] = "Passed — Authentic Voice Preserved";

  const isExactMode = mode === "exact_voice" || mode === "preserve";

  if (isExactMode) {
    if (unnecessarySynonymSwaps.length >= 3 || lexicalDriftPct > 12) {
      isPass = false;
      verdict = "Failed — Generic Academic Normalization";
    } else if (unnecessarySynonymSwaps.length > 0 || lexicalDriftPct > 5) {
      isPass = true;
      verdict = "Warning — Lexical Drift Detected";
    }
  } else if (mode === "light_cleanup") {
    if (unnecessarySynonymSwaps.length >= 2 || lexicalDriftPct > 8) {
      isPass = false;
      verdict = "Failed — Generic Academic Normalization";
    }
  }

  const summary = `Grammar Fixes: ${grammarFixesCount} | Vocabulary Alignment: ${vocabularyAlignmentPct}% | Structural Alignment: ${structuralAlignmentPct}% | Lexical Drift: ${lexicalDriftPct}% | Unnecessary Synonym Swaps: ${unnecessarySynonymSwaps.length}`;

  return {
    grammarFixesCount,
    vocabularyAlignmentPct,
    structuralAlignmentPct,
    lexicalDriftPct,
    unnecessarySynonymCount: unnecessarySynonymSwaps.length,
    unnecessarySynonymSwaps,
    flaggedTransitions,
    flaggedAdjectives,
    tokenChanges,
    isPass,
    enforcementVerdict: verdict,
    summary,
  };
}
