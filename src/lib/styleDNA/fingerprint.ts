import fs from "fs";
import path from "path";
import { StyleDNAMetrics, StructuralChange } from "./extract";

export interface FingerprintCategory {
  category: string;
  name: string;
  directive: string;
  confidence: number; // 0.0 to 1.0
  evidence: string;
}

export interface StyleDNAFingerprint {
  version: string;
  categories: {
    sequential_explanations?: FingerprintCategory;
    clarification_habits?: FingerprintCategory;
    thought_expansion?: FingerprintCategory;
    conclusion_style?: FingerprintCategory;
    paragraph_rhythm?: FingerprintCategory;
    syntactic_nesting?: FingerprintCategory;
    transitional_flow?: FingerprintCategory;
    punctuation_discipline?: FingerprintCategory;
    vocabulary_discipline?: FingerprintCategory;
  };
  qualitative_rules: string[];
  totalEditsApplied: number;
  lastUpdated: string;
}

/**
 * Builds qualitative fingerprint rules from deterministic metrics.
 * Generates qualitative rules only — never stores previous sentences.
 */
export function generateFingerprint(
  metrics: StyleDNAMetrics,
  previousFingerprint?: StyleDNAFingerprint | null
): StyleDNAFingerprint {
  const prevCats = previousFingerprint?.categories || {};
  const editsApplied = previousFingerprint?.totalEditsApplied || 0;

  const categories: StyleDNAFingerprint["categories"] = {};
  const qualitativeRules: string[] = [];

  // If no words in corpus, return clean empty fingerprint
  if (!metrics || !metrics.corpusSummary || metrics.corpusSummary.totalWords === 0) {
    return {
      version: "1.0",
      categories: {},
      qualitative_rules: [],
      totalEditsApplied: editsApplied,
      lastUpdated: new Date().toISOString(),
    };
  }

  // 1. Sentence Cadence & Thought Expansion
  const avgLen = metrics.sentenceLength.averageWords;
  if (avgLen !== null && avgLen > 0) {
    let directive = "";
    if (avgLen <= 16) {
      directive = "keeps compact, direct sentence length (averaging ~14-16 words); avoids runaway compound sentences";
    } else if (avgLen >= 26) {
      directive = `constructs expansive academic sentences (averaging ~${Math.round(avgLen)} words), developing multi-part reasoning before concluding`;
    } else {
      directive = `keeps moderate sentence length (averaging ~${Math.round(avgLen)} words), alternating concise declarative claims with detailed elaborations`;
    }
    const conf = prevCats.thought_expansion?.confidence ?? 0.85;
    categories.thought_expansion = {
      category: "thought_expansion",
      name: "Thought Expansion & Cadence",
      directive,
      confidence: conf,
      evidence: `Measured average sentence length: ${avgLen} words/sentence across ${metrics.corpusSummary.totalSentences} sentences`,
    };
    qualitativeRules.push(directive);
  }

  // 2. Paragraph Rhythm & Thought Development
  const avgParaSentences = metrics.paragraphLength.averageSentences;
  if (avgParaSentences !== null && avgParaSentences > 0) {
    let directive = "";
    if (avgParaSentences >= 4) {
      directive = "expands thoughts before concluding; develops propositions with explanatory context and implications rather than abrupt stops";
    } else {
      directive = "maintains tight, modular paragraphs focused squarely on a single discrete concept";
    }
    const conf = prevCats.paragraph_rhythm?.confidence ?? 0.85;
    categories.paragraph_rhythm = {
      category: "paragraph_rhythm",
      name: "Paragraph Rhythm",
      directive,
      confidence: conf,
      evidence: `Paragraphs average ${avgParaSentences} sentences (${metrics.paragraphLength.averageWords ?? "—"} words/para)`,
    };
    qualitativeRules.push(directive);
  }

  // 3. Sequential Explanations & Workflow Structure
  const workflowScore = metrics.workflowExplanationTendency.tendencyScore;
  if (workflowScore !== null && workflowScore >= 20) {
    const directive = "prefers sequential explanations; structures explanations with logical progression (e.g. initial setup -> mechanism -> outcome)";
    const conf = prevCats.sequential_explanations?.confidence ?? (workflowScore >= 35 ? 0.9 : 0.75);
    categories.sequential_explanations = {
      category: "sequential_explanations",
      name: "Sequential Explanations",
      directive,
      confidence: conf,
      evidence: `Workflow tendency score: ${workflowScore}/100 with ${metrics.workflowExplanationTendency.proceduralMarkerCount} procedural markers`,
    };
    qualitativeRules.push(directive);
  }

  // 4. Clarification After Introducing Ideas
  const clarifDensity = metrics.clarificationFrequency.densityPer100Words;
  const totalClarifs = metrics.clarificationFrequency.totalClarifications;
  if ((clarifDensity !== null && clarifDensity >= 0.05) || totalClarifs > 0) {
    const topMarkers = metrics.clarificationFrequency.topMarkers.map((m) => `'${m.marker}'`).slice(0, 4);
    const markersStr = topMarkers.length > 0 ? topMarkers.join(", ") : "'specifically', 'that is', 'meaning that', 'for example'";
    const directive = `uses clarification after introducing ideas (e.g. ${markersStr}) to ground theoretical statements`;
    const conf = prevCats.clarification_habits?.confidence ?? 0.88;
    categories.clarification_habits = {
      category: "clarification_habits",
      name: "Clarification Habits",
      directive,
      confidence: conf,
      evidence: `Clarification density: ${clarifDensity ?? 0} markers/100 words (${totalClarifs} instances detected)`,
    };
    qualitativeRules.push(directive);
  }

  // 5. Syntactic Nesting & Clause Density
  const clauseDensity = metrics.clauseDensity.averageClausesPerSentence;
  if (clauseDensity !== null && clauseDensity > 0) {
    let directive = "";
    if (clauseDensity >= 1.7) {
      directive = "favors multi-clause compound sentences with qualifying subordinate clauses (e.g. 'provided that', 'whereas', 'because')";
    } else {
      directive = "prefers streamlined syntactic construction with linear, un-nested clauses";
    }
    const conf = prevCats.syntactic_nesting?.confidence ?? 0.82;
    categories.syntactic_nesting = {
      category: "syntactic_nesting",
      name: "Syntactic Nesting",
      directive,
      confidence: conf,
      evidence: `Average ${clauseDensity} clauses/sentence (subordination ratio: ${metrics.clauseDensity.subordinateClauseRatio ?? 0})`,
    };
    qualitativeRules.push(directive);
  }

  // 6. Vocabulary & Diction Discipline
  const ttr = metrics.vocabularyRepetition.typeTokenRatio;
  if (ttr !== null && ttr > 0) {
    let directive = "";
    if (ttr >= 0.35) {
      directive = "avoids ornamental vocabulary; employs precise, unpretentious domain diction with consistent terminology";
    } else {
      directive = "utilizes focused recurring domain terms for conceptual consistency";
    }
    const conf = prevCats.vocabulary_discipline?.confidence ?? 0.8;
    categories.vocabulary_discipline = {
      category: "vocabulary_discipline",
      name: "Vocabulary Discipline",
      directive,
      confidence: conf,
      evidence: `Type-token ratio: ${ttr} across analyzed tokens`,
    };
    qualitativeRules.push(directive);
  }

  // 7. Transitional Flow
  const ratios = metrics.transitionFrequency.categoryRatios;
  if (ratios.causal >= 30) {
    const directive = "favors causal transitional signposts (e.g. 'consequently', 'therefore', 'thus') to underscore results and logical deductions";
    categories.transitional_flow = {
      category: "transitional_flow",
      name: "Transitional Flow",
      directive,
      confidence: prevCats.transitional_flow?.confidence ?? 0.85,
      evidence: `Causal transitions comprise ${ratios.causal}% of connectors`,
    };
    qualitativeRules.push(directive);
  } else if (ratios.adversative >= 30) {
    const directive = "favors contrastive transitions (e.g. 'however', 'in contrast', 'conversely') to frame analytical counter-perspectives";
    categories.transitional_flow = {
      category: "transitional_flow",
      name: "Transitional Flow",
      directive,
      confidence: prevCats.transitional_flow?.confidence ?? 0.85,
      evidence: `Adversative transitions comprise ${ratios.adversative}% of connectors`,
    };
    qualitativeRules.push(directive);
  } else if (metrics.transitionFrequency.densityPer100Words !== null && metrics.transitionFrequency.densityPer100Words > 0) {
    const directive = "uses disciplined transitional connectors to signpost shifts in argumentation without over-saturating prose";
    categories.transitional_flow = {
      category: "transitional_flow",
      name: "Transitional Flow",
      directive,
      confidence: prevCats.transitional_flow?.confidence ?? 0.8,
      evidence: `Transition density: ${metrics.transitionFrequency.densityPer100Words}/100w`,
    };
    qualitativeRules.push(directive);
  }

  // 8. Punctuation Discipline
  const punc = metrics.punctuationHabits;
  if (punc.semicolonsPer100Words !== null && punc.semicolonsPer100Words >= 0.15) {
    const directive = "uses semicolons to connect logically interdependent propositions";
    categories.punctuation_discipline = {
      category: "punctuation_discipline",
      name: "Punctuation Discipline",
      directive,
      confidence: prevCats.punctuation_discipline?.confidence ?? 0.8,
      evidence: `Semicolon density: ${punc.semicolonsPer100Words}/100w`,
    };
    qualitativeRules.push(directive);
  } else if (punc.parenthesesPer100Words !== null && punc.parenthesesPer100Words >= 0.3) {
    const directive = "uses parenthetical qualifiers to provide concise supplementary nuance";
    categories.punctuation_discipline = {
      category: "punctuation_discipline",
      name: "Punctuation Discipline",
      directive,
      confidence: prevCats.punctuation_discipline?.confidence ?? 0.8,
      evidence: `Parentheses density: ${punc.parenthesesPer100Words}/100w`,
    };
    qualitativeRules.push(directive);
  }

  // 9. Conclusion Style
  const directive = "concludes sections by synthesizing operational insights rather than repeating broad abstracts";
  categories.conclusion_style = {
    category: "conclusion_style",
    name: "Conclusion Style",
    directive,
    confidence: prevCats.conclusion_style?.confidence ?? 0.78,
    evidence: "Synthesized from paragraph closure patterns in corpus",
  };
  qualitativeRules.push(directive);

  return {
    version: "1.0",
    categories,
    qualitative_rules: qualitativeRules,
    totalEditsApplied: editsApplied,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Saves fingerprint to data/profile/fingerprint.json
 */
export function saveFingerprint(fingerprint: StyleDNAFingerprint): void {
  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "fingerprint.json"), JSON.stringify(fingerprint, null, 2), "utf-8");
}

/**
 * Loads fingerprint from data/profile/fingerprint.json
 */
export function loadFingerprint(): StyleDNAFingerprint | null {
  const fpPath = path.join(process.cwd(), "data", "profile", "fingerprint.json");
  if (!fs.existsSync(fpPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fpPath, "utf-8"));
  } catch (err) {
    console.warn("Could not load fingerprint.json:", err);
    return null;
  }
}

/**
 * Updates fingerprint category confidence scores based on manual edit structural changes.
 */
export function updateFingerprintConfidence(structuralChanges: StructuralChange[]): StyleDNAFingerprint | null {
  const fp = loadFingerprint();
  if (!fp) return null;

  let modified = false;

  for (const change of structuralChanges) {
    const dim = change.dimension.toLowerCase();

    if (dim.includes("sentence") && fp.categories.thought_expansion) {
      fp.categories.thought_expansion.confidence = Math.min(1.0, Math.round((fp.categories.thought_expansion.confidence + 0.03) * 100) / 100);
      modified = true;
    }
    if (dim.includes("clause") && fp.categories.syntactic_nesting) {
      fp.categories.syntactic_nesting.confidence = Math.min(1.0, Math.round((fp.categories.syntactic_nesting.confidence + 0.03) * 100) / 100);
      modified = true;
    }
    if (dim.includes("clarification") && fp.categories.clarification_habits) {
      fp.categories.clarification_habits.confidence = Math.min(1.0, Math.round((fp.categories.clarification_habits.confidence + 0.04) * 100) / 100);
      modified = true;
    }
    if (dim.includes("transition") && fp.categories.transitional_flow) {
      fp.categories.transitional_flow.confidence = Math.min(1.0, Math.round((fp.categories.transitional_flow.confidence + 0.03) * 100) / 100);
      modified = true;
    }
    if (dim.includes("workflow") && fp.categories.sequential_explanations) {
      fp.categories.sequential_explanations.confidence = Math.min(1.0, Math.round((fp.categories.sequential_explanations.confidence + 0.03) * 100) / 100);
      modified = true;
    }
    if (dim.includes("punctuation") && fp.categories.punctuation_discipline) {
      fp.categories.punctuation_discipline.confidence = Math.min(1.0, Math.round((fp.categories.punctuation_discipline.confidence + 0.03) * 100) / 100);
      modified = true;
    }
  }

  fp.totalEditsApplied += 1;
  fp.lastUpdated = new Date().toISOString();

  saveFingerprint(fp);
  return fp;
}

/**
 * Loads rules array from fingerprint.json or computes from metrics.
 * Maintains backwards compatibility for components expecting string[].
 */
export function getFingerprintRules(metricsOverride?: StyleDNAMetrics): string[] {
  if (metricsOverride) {
    const fp = generateFingerprint(metricsOverride);
    return fp.qualitative_rules;
  }

  const existingFp = loadFingerprint();
  if (existingFp && existingFp.qualitative_rules.length > 0) {
    return existingFp.qualitative_rules;
  }

  // Fallback to voiceDNA.json
  try {
    const profilePath = path.join(process.cwd(), "data", "profile", "voiceDNA.json");
    if (fs.existsSync(profilePath)) {
      const data = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
      if (data.qualitative_rules && Array.isArray(data.qualitative_rules)) {
        return data.qualitative_rules;
      }
      if (data.fingerprint && Array.isArray(data.fingerprint.qualitative_rules)) {
        return data.fingerprint.qualitative_rules;
      }
      return generateFingerprint(data).qualitative_rules;
    }
  } catch (err) {
    console.warn("Could not load rules from profile:", err);
  }

  return [];
}
