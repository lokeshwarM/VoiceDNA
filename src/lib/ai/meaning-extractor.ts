import { extractCitations, extractEquations, extractNumbers } from "./fidelity-guard";

export interface ProtectedTokenMap {
  technicalTerms: string[];
  acronyms: string[];
  equations: string[];
  citations: string[];
  numbersAndUnits: string[];
  codeAndFiles: string[];
  allProtectedTokens: string[];
}

export interface SemanticEnvelope {
  protectedTokens: ProtectedTokenMap;
  coreClaims: string[];
  invarianceDirectives: string[];
}

/**
 * Extracts technical acronyms and capitalized domain terms (e.g., ACO, ALNS, YOLOv8, TrajectoryLSTM, ROS 2).
 */
export function extractTechnicalTerms(text: string): { acronyms: string[]; technicalTerms: string[] } {
  const acronyms = new Set<string>();
  const terms = new Set<string>();

  // 1. All-caps acronyms (2-7 letters), optional numbers (e.g. ACO, ALNS, ROS, IMU, GPS, IEEE)
  const acronymRegex = /\b[A-Z]{2,8}(?:\s+[0-9]+)?\b/g;
  let m;
  while ((m = acronymRegex.exec(text)) !== null) {
    const val = m[0].trim();
    // Exclude common English words that might be capitalized at start of sentence
    if (!["THE", "FOR", "AND", "BUT", "NOT", "WITH", "ALL"].includes(val)) {
      acronyms.add(val);
    }
  }

  // 2. Mixed alphanumeric models & architectures (e.g. YOLOv8, YOLOv8-nano, Jetson, VisDrone, TrajectoryLSTM, Lucas-Kanade)
  const mixedModelRegex = /\b[A-Z][a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)+\b/g;
  while ((m = mixedModelRegex.exec(text)) !== null) {
    terms.add(m[0].trim());
  }

  // 3. CamelCase compound technical terms (e.g. TrajectoryLSTM, VisDrone, ResNet, PyTorch)
  const camelCaseRegex = /\b[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*\b/g;
  while ((m = camelCaseRegex.exec(text)) !== null) {
    terms.add(m[0].trim());
  }

  // 4. Special technical metrics / abbreviations (e.g. mAP50, mAP, FPS, 2-opt)
  const specialMetricsRegex = /\b(?:mAP(?:50|75)?|FPS|2-opt|k-NN|IoU)\b/gi;
  while ((m = specialMetricsRegex.exec(text)) !== null) {
    terms.add(m[0].trim());
  }

  return {
    acronyms: Array.from(acronyms),
    technicalTerms: Array.from(terms),
  };
}

/**
 * Extracts filenames, file extensions, and code snippets from the draft input.
 */
export function extractCodeAndFiles(text: string): string[] {
  const items = new Set<string>();

  // Code backticks `...`
  const codeRegex = /`([^`]+)`/g;
  let m;
  while ((m = codeRegex.exec(text)) !== null) {
    items.add(m[1].trim());
  }

  // Filenames with common extensions
  const fileRegex = /\b[a-zA-Z0-9_.-]+\.(?:py|ts|js|tsx|jsx|json|cpp|c|h|txt|pdf|csv|yaml|yml|md)\b/gi;
  while ((m = fileRegex.exec(text)) !== null) {
    items.add(m[0].trim());
  }

  return Array.from(items);
}

/**
 * Extracts the complete Protected Token Map from draft input.
 * These tokens must survive the edit completely intact.
 */
export function buildProtectedTokenMap(draftInput: string): ProtectedTokenMap {
  const citations = extractCitations(draftInput);
  const equations = extractEquations(draftInput);
  const numbersAndUnits = extractNumbers(draftInput);
  const { acronyms, technicalTerms } = extractTechnicalTerms(draftInput);
  const codeAndFiles = extractCodeAndFiles(draftInput);

  const allTokens = new Set<string>([
    ...citations,
    ...equations,
    ...numbersAndUnits,
    ...acronyms,
    ...technicalTerms,
    ...codeAndFiles,
  ]);

  return {
    technicalTerms,
    acronyms,
    equations,
    citations,
    numbersAndUnits,
    codeAndFiles,
    allProtectedTokens: Array.from(allTokens),
  };
}

/**
 * Builds the full Semantic Envelope from the draft input.
 * In Source 2 philosophy: the input provides meaning and facts ONLY, not style.
 */
export function extractSemanticEnvelope(draftInput: string): SemanticEnvelope {
  const protectedTokens = buildProtectedTokenMap(draftInput);

  // Extract core causal/propositional sentences
  const sentences = draftInput.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
  const coreClaims = sentences.map((s, idx) => `[Proposition ${idx + 1}]: ${s.trim()}`);

  const invarianceDirectives: string[] = [
    `PROTECTED ENTITIES: You must preserve all technical acronyms and terms (${protectedTokens.acronyms.concat(protectedTokens.technicalTerms).join(", ") || "none"}).`,
    `NUMERICAL FIGURES & UNITS: Retain all numbers, measurements, and percentages exactly (${protectedTokens.numbersAndUnits.join(", ") || "none"}).`,
    `CITATIONS: Preserve all citation markers verbatim (${protectedTokens.citations.join(", ") || "none"}).`,
    `MATHEMATICS: Preserve all equations and LaTeX expressions (${protectedTokens.equations.join(" | ") || "none"}).`,
  ];

  return {
    protectedTokens,
    coreClaims,
    invarianceDirectives,
  };
}

/**
 * Deterministically verifies that all protected tokens survived in the rewritten output.
 */
export function verifyProtectedTokens(
  rewrittenOutput: string,
  tokenMap: ProtectedTokenMap
): {
  preserved: string[];
  missing: string[];
  allPreserved: boolean;
  preservationRate: number;
} {
  const preserved: string[] = [];
  const missing: string[] = [];

  const lowerOutput = rewrittenOutput.toLowerCase();

  for (const token of tokenMap.allProtectedTokens) {
    // For citations and equations, match exact or trimmed
    if (token.startsWith("[") || token.startsWith("$") || token.includes("\\")) {
      if (rewrittenOutput.includes(token)) {
        preserved.push(token);
      } else {
        missing.push(token);
      }
    } else {
      // For words and numbers, check case-insensitive boundary match
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, "i");
      if (regex.test(rewrittenOutput) || lowerOutput.includes(token.toLowerCase())) {
        preserved.push(token);
      } else {
        missing.push(token);
      }
    }
  }

  const total = tokenMap.allProtectedTokens.length;
  const preservationRate = total > 0 ? Math.round((preserved.length / total) * 100) : 100;

  return {
    preserved,
    missing,
    allPreserved: missing.length === 0,
    preservationRate,
  };
}
