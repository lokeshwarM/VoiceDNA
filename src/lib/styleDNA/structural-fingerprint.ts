import fs from "fs";
import path from "path";
import { StyleDNAMetrics } from "./extract";

export interface StructuralFingerprint {
  version: "2.0";
  sentenceRhythm: {
    averageWords: number;
    medianWords: number;
    stdDev: number;
    naturalRange: [number, number];
    boundaryConstraint: string;
  };
  clauseDensity: {
    averageClausesPerSentence: number;
    subordinationRatio: number;
    coordinationRatio: number;
    boundaryConstraint: string;
  };
  clarificationHabits: {
    frequencyPer100Words: number;
    preferredMarkers: string[];
    boundaryConstraint: string;
  };
  workflowSequencing: {
    tendencyScore: number;
    progression: string;
    boundaryConstraint: string;
  };
  paragraphCadence: {
    averageSentences: number;
    averageWords: number;
    boundaryConstraint: string;
  };
  thoughtExpansion: {
    pattern: string;
    boundaryConstraint: string;
  };
  structuralConstraints: string[];
}

/**
 * Extracts author's structural rhythms from corpus metrics and formulates them
 * as natural boundaries/limits rather than rigid commands.
 */
export function extractStructuralFingerprint(metrics: StyleDNAMetrics): StructuralFingerprint {
  const avgWords = Math.round((metrics.sentenceLength.averageWords ?? 35) * 10) / 10;
  const medianWords = metrics.sentenceLength.medianWords ?? 32;
  const stdDev = Math.round((metrics.sentenceLength.stdDev ?? 14) * 10) / 10;
  const minBound = Math.max(10, Math.round(avgWords - stdDev * 1.2));
  const maxBound = Math.round(avgWords + stdDev * 1.5);

  const avgClauses = Math.round((metrics.clauseDensity.averageClausesPerSentence ?? 2.8) * 10) / 10;
  const subRatio = Math.round((metrics.clauseDensity.subordinateClauseRatio ?? 1.2) * 10) / 10;
  const coordRatio = Math.round((metrics.clauseDensity.coordinationRatio ?? 1.0) * 10) / 10;

  const clarifFreq = Math.round((metrics.clarificationFrequency.densityPer100Words ?? 0.3) * 10) / 10;
  const workflowScore = metrics.workflowExplanationTendency.tendencyScore ?? 45;

  const avgParaSentences = Math.round((metrics.paragraphLength.averageSentences ?? 2.5) * 10) / 10;
  const avgParaWords = Math.round(metrics.paragraphLength.averageWords ?? 90);

  const rhythmConstraint = `Do not drift excessively away from author's natural rhythm (measured: ~${avgWords} words/sentence; natural bounds: ${minBound}–${maxBound} words). Avoid both staccato soundbites and runaway run-ons.`;
  const clauseConstraint = `Allow sentences to develop naturally across ${avgClauses} clauses with balanced subordination (${subRatio}) and coordination (${coordRatio}). Do not artificially truncate or inflate clause count.`;
  const clarificationConstraint = `Ground operational mechanics using author's clarification habits ("for example", "that is", "specifically") when introducing non-trivial mechanisms.`;
  const workflowConstraint = `Structure analytical sections sequentially: establish contextual baseline -> formalize operational mechanism -> evaluate outcomes.`;
  const paragraphConstraint = `Develop modular, single-focus paragraphs (~${avgParaWords} words across ~${avgParaSentences} sentences) developing one conceptual proposition completely.`;
  const expansionConstraint = `Expand logical propositions thoroughly before concluding; avoid premature conclusions or terse abstractions.`;

  const structuralConstraints: string[] = [
    rhythmConstraint,
    clauseConstraint,
    clarificationConstraint,
    workflowConstraint,
    paragraphConstraint,
    expansionConstraint,
  ];

  return {
    version: "2.0",
    sentenceRhythm: {
      averageWords: avgWords,
      medianWords,
      stdDev,
      naturalRange: [minBound, maxBound],
      boundaryConstraint: rhythmConstraint,
    },
    clauseDensity: {
      averageClausesPerSentence: avgClauses,
      subordinationRatio: subRatio,
      coordinationRatio: coordRatio,
      boundaryConstraint: clauseConstraint,
    },
    clarificationHabits: {
      frequencyPer100Words: clarifFreq,
      preferredMarkers: ["for example", "that is", "specifically", "let's take"],
      boundaryConstraint: clarificationConstraint,
    },
    workflowSequencing: {
      tendencyScore: workflowScore,
      progression: "Contextual Baseline -> Operational Mechanism -> Empirical Outcome",
      boundaryConstraint: workflowConstraint,
    },
    paragraphCadence: {
      averageSentences: avgParaSentences,
      averageWords: avgParaWords,
      boundaryConstraint: paragraphConstraint,
    },
    thoughtExpansion: {
      pattern: "Expansive multi-part reasoning that unpacks propositions before concluding",
      boundaryConstraint: expansionConstraint,
    },
    structuralConstraints,
  };
}

/**
 * Saves the Structural Fingerprint to data/profile/structural_fingerprint.json
 */
export function saveStructuralFingerprint(fingerprint: StructuralFingerprint): void {
  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, "structural_fingerprint.json"),
    JSON.stringify(fingerprint, null, 2),
    "utf-8"
  );
}

/**
 * Loads the Structural Fingerprint from data/profile/structural_fingerprint.json
 */
export function loadStructuralFingerprint(): StructuralFingerprint | null {
  const filePath = path.join(process.cwd(), "data", "profile", "structural_fingerprint.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
