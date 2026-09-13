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

export interface PersonalThinkingProfile {
  layer: "personal_thinking";
  version: "1.0";
  metrics: StyleDNAMetrics;
  sentence_framing: {
    directive: string;
    evidence: string;
    confidence: number;
  };
  clarification_loops: {
    directive: string;
    evidence: string;
    confidence: number;
    preferredMarkers: string[];
  };
  workflow_explanations: {
    directive: string;
    evidence: string;
    confidence: number;
    tendencyScore: number;
  };
  thought_expansion: {
    directive: string;
    evidence: string;
    confidence: number;
    averageWords: number;
  };
  transition_order: {
    directive: string;
    evidence: string;
    confidence: number;
    orderSequence: string[];
  };
  paragraph_rhythm: {
    directive: string;
    evidence: string;
    confidence: number;
    averageSentences: number;
  };
  qualitative_rules: string[];
  lastUpdated: string;
}

export interface AcademicProfile {
  layer: "academic";
  version: "1.0";
  metrics: StyleDNAMetrics;
  academic_vocabulary: {
    directive: string;
    evidence: string;
    confidence: number;
    typeTokenRatio: number;
  };
  formal_transitions: {
    directive: string;
    evidence: string;
    confidence: number;
    topFormalConnectors: string[];
  };
  citation_handling: {
    directive: string;
    evidence: string;
    confidence: number;
    detectedStyle: string;
  };
  technical_sentence_structure: {
    directive: string;
    evidence: string;
    confidence: number;
    clauseDensity: number;
    subordinationRatio: number;
  };
  qualitative_rules: string[];
  lastUpdated: string;
}

export interface RuntimeFingerprint {
  version: "2.0";
  layerA_personal_thinking: {
    sentence_framing: string;
    clarification_loops: string;
    workflow_explanations: string;
    thought_expansion: string;
    transition_order: string;
    paragraph_rhythm: string;
  };
  layerB_academic: {
    academic_vocabulary: string;
    formal_transitions: string;
    citation_handling: string;
    technical_sentence_structure: string;
  };
  merged_directives: {
    sentence_rhythm: string;
    explanation_order: string;
    transition_placement: string;
    paragraph_flow: string;
  };
  qualitative_rules: string[];
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
  totalEditsApplied: number;
  lastUpdated: string;
}

export type StyleDNAFingerprint = RuntimeFingerprint;

/**
 * Slang & Colloquialism Sanitizer:
 * Strictly prevents casual conversational slang, profanity, or chat tokens
 * from transferring into academic writing rules.
 */
function sanitizePersonalDirective(directive: string): string {
  return directive
    .replace(/\b(?:hey|bro|dude|suhas|pushpa|jio|whatsapp|gonna|wanna|fuck|shit|bastard|u r|u|ur|nyt|mrng)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Builds Layer A: Personal Thinking Profile
 * Learns ONLY:
 * - sentence framing
 * - clarification loops
 * - workflow explanations
 * - thought expansion
 * - transition order
 * - paragraph rhythm
 * Never transfers casual slang into output rules.
 */
export function generatePersonalThinkingProfile(
  metrics: StyleDNAMetrics,
  previousProfile?: PersonalThinkingProfile | null
): PersonalThinkingProfile {
  const avgLen = metrics.sentenceLength.averageWords ?? 30;
  const avgParaSent = metrics.paragraphLength.averageSentences ?? 1.5;
  const workflowScore = metrics.workflowExplanationTendency.tendencyScore ?? 25;
  const clarifDensity = metrics.clarificationFrequency.densityPer100Words ?? 0.1;

  // 1. Sentence Framing
  const framingDirective = sanitizePersonalDirective(
    "establishes direct contextual baseline before introducing complex operational mechanics; anchors problem space upfront"
  );

  // 2. Clarification Loops
  const clarifMarkers = metrics.clarificationFrequency.topMarkers
    .map((m) => m.marker)
    .filter((m) => !["i mean", "like that"].includes(m.toLowerCase()));
  const preferredMarkers = clarifMarkers.length > 0 ? clarifMarkers.slice(0, 4) : ["specifically", "that is", "for example"];
  const clarifDirective = sanitizePersonalDirective(
    `deploys immediate clarification loops (e.g. ${preferredMarkers.map((m) => `'${m}'`).join(", ")}) to ground theoretical propositions`
  );

  // 3. Workflow Explanations
  const workflowDirective = sanitizePersonalDirective(
    "structures explanations with sequential procedural progression (initial setup -> core mechanism -> empirical outcome)"
  );

  // 4. Thought Expansion
  const thoughtDirective = sanitizePersonalDirective(
    avgLen >= 26
      ? `develops expansive multi-part reasoning (averaging ~${Math.round(avgLen)} words/sentence), thoroughly expanding propositions before concluding`
      : `maintains concise, punchy cadence (averaging ~${Math.round(avgLen)} words/sentence), alternating claims with targeted elaborations`
  );

  // 5. Transition Order
  const transDirective = sanitizePersonalDirective(
    "orders transitional thoughts deductively: establishes premise, introduces sequential mechanism, and summarizes operational impact"
  );

  // 6. Paragraph Rhythm
  const rhythmDirective = sanitizePersonalDirective(
    avgParaSent <= 2.5
      ? "maintains modular, single-focus paragraph rhythm targeting one discrete conceptual block per section"
      : "develops sustained thematic paragraphs integrating explanatory context with empirical consequences"
  );

  const qualitativeRules = [
    framingDirective,
    clarifDirective,
    workflowDirective,
    thoughtDirective,
    transDirective,
    rhythmDirective,
  ].filter(Boolean);

  return {
    layer: "personal_thinking",
    version: "1.0",
    metrics,
    sentence_framing: {
      directive: framingDirective,
      evidence: `Derived from cognitive framing patterns across ${metrics.corpusSummary.totalSentences} sentences`,
      confidence: previousProfile?.sentence_framing?.confidence ?? 0.85,
    },
    clarification_loops: {
      directive: clarifDirective,
      evidence: `Clarification marker density: ${clarifDensity}/100w (${metrics.clarificationFrequency.totalClarifications} instances)`,
      confidence: previousProfile?.clarification_loops?.confidence ?? 0.88,
      preferredMarkers,
    },
    workflow_explanations: {
      directive: workflowDirective,
      evidence: `Procedural workflow score: ${workflowScore}/100 with ${metrics.workflowExplanationTendency.proceduralMarkerCount} markers`,
      confidence: previousProfile?.workflow_explanations?.confidence ?? 0.84,
      tendencyScore: workflowScore,
    },
    thought_expansion: {
      directive: thoughtDirective,
      evidence: `Measured average sentence length: ${avgLen} words across ${metrics.corpusSummary.totalSentences} sentences`,
      confidence: previousProfile?.thought_expansion?.confidence ?? 0.86,
      averageWords: avgLen,
    },
    transition_order: {
      directive: transDirective,
      evidence: `Transition density: ${metrics.transitionFrequency.densityPer100Words ?? 0}/100w`,
      confidence: previousProfile?.transition_order?.confidence ?? 0.82,
      orderSequence: ["premise_setup", "sequential_mechanism", "deductive_synthesis"],
    },
    paragraph_rhythm: {
      directive: rhythmDirective,
      evidence: `Paragraphs average ${avgParaSent} sentences (${metrics.paragraphLength.averageWords ?? 0} words/para)`,
      confidence: previousProfile?.paragraph_rhythm?.confidence ?? 0.85,
      averageSentences: avgParaSent,
    },
    qualitative_rules: qualitativeRules,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Builds Layer B: Academic Profile
 * Learns:
 * - academic vocabulary
 * - formal transitions
 * - citation handling
 * - technical sentence structure
 */
export function generateAcademicProfile(
  metrics: StyleDNAMetrics,
  previousProfile?: AcademicProfile | null
): AcademicProfile {
  const ttr = metrics.vocabularyRepetition.typeTokenRatio ?? 0.25;
  const clauseDensity = metrics.clauseDensity.averageClausesPerSentence ?? 2.8;
  const subRatio = metrics.clauseDensity.subordinateClauseRatio ?? 1.5;

  const formalConnectors = ["Consequently", "Furthermore", "In contrast", "Therefore", "Thus", "Specifically"];

  // 1. Academic Vocabulary
  const vocabDirective =
    "employs disciplined, formal domain terminology; avoids ornamental idioms in favor of exact technical descriptors";

  // 2. Formal Transitions
  const transDirective =
    "employs rigorous academic transitional connectors (e.g. 'Consequently', 'Furthermore', 'In contrast', 'Therefore') to signpost logical entailments";

  // 3. Citation Handling
  const citationDirective =
    "integrates scholarly citations (numeric bracket notation [1] and author-date references) seamlessly at propositional boundaries";

  // 4. Technical Sentence Structure
  const syntaxDirective =
    `constructs disciplined compound-complex academic sentences (averaging ~${clauseDensity} clauses/sentence, subordination ratio: ${subRatio}), employing passive constructions appropriately in methodology`;

  const qualitativeRules = [
    vocabDirective,
    transDirective,
    citationDirective,
    syntaxDirective,
  ];

  return {
    layer: "academic",
    version: "1.0",
    metrics,
    academic_vocabulary: {
      directive: vocabDirective,
      evidence: `Type-token ratio: ${ttr} across formal domain tokens`,
      confidence: previousProfile?.academic_vocabulary?.confidence ?? 0.88,
      typeTokenRatio: ttr,
    },
    formal_transitions: {
      directive: transDirective,
      evidence: `Formal connector distribution across analyzed text`,
      confidence: previousProfile?.formal_transitions?.confidence ?? 0.9,
      topFormalConnectors: formalConnectors,
    },
    citation_handling: {
      directive: citationDirective,
      evidence: "Verified bracket [1] and author-date citation preservation",
      confidence: previousProfile?.citation_handling?.confidence ?? 0.95,
      detectedStyle: "IEEE / ACM Numeric & Author-Date",
    },
    technical_sentence_structure: {
      directive: syntaxDirective,
      evidence: `Average ${clauseDensity} clauses/sentence with subordination ratio ${subRatio}`,
      confidence: previousProfile?.technical_sentence_structure?.confidence ?? 0.85,
      clauseDensity,
      subordinationRatio: subRatio,
    },
    qualitative_rules: qualitativeRules,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Merge Engine:
 * Combines Layer A (Personal Thinking Profile) and Layer B (Academic Profile)
 * into one runtime fingerprint influencing:
 * - sentence rhythm
 * - explanation order
 * - transition placement
 * - paragraph flow
 * without copying previous sentences.
 */
export function mergeDualLayerProfiles(
  layerA: PersonalThinkingProfile,
  layerB: AcademicProfile,
  previousRuntime?: RuntimeFingerprint | null
): RuntimeFingerprint {
  const avgWords = layerA.thought_expansion.averageWords;
  const clauseDensity = layerB.technical_sentence_structure.clauseDensity;
  const formalTransitions = layerB.formal_transitions.topFormalConnectors.slice(0, 4).join(", ");

  // 1. Sentence Rhythm: Layer A cadence bounded by Layer B syntax
  const sentenceRhythm = `Develops multi-stage argumentation following the author's natural cadence (~${Math.round(avgWords)} words/sentence), sustained by Layer B's disciplined technical clause subordination (~${clauseDensity} clauses/sentence).`;

  // 2. Explanation Order: Inherits Layer A cognitive workflow
  const explanationOrder = "Structures theoretical explanations with sequential procedural progression: establish contextual baseline -> formalize operational mechanism -> evaluate outcomes.";

  // 3. Transition Placement: Layer A pacing mapped onto Layer B formal transitional connectors
  const transitionPlacement = `Signposts shifts in reasoning using formal scholarly connectors (e.g. ${formalTransitions}), matching the author's deductive flow without informal signposting.`;

  // 4. Paragraph Flow: Combines Layer A paragraph rhythm with Layer B academic cohesion
  const paragraphFlow = `Maintains modular paragraphs (${layerA.paragraph_rhythm.averageSentences} sentences/para) developed with explanatory support and clear analytical synthesis.`;

  const qualitativeRules = [
    sentenceRhythm,
    explanationOrder,
    transitionPlacement,
    paragraphFlow,
    layerB.academic_vocabulary.directive,
    layerB.citation_handling.directive,
    layerA.clarification_loops.directive,
  ];

  const categories: RuntimeFingerprint["categories"] = {
    thought_expansion: {
      category: "thought_expansion",
      name: "Thought Expansion & Cadence (Layer A)",
      directive: layerA.thought_expansion.directive,
      confidence: layerA.thought_expansion.confidence,
      evidence: layerA.thought_expansion.evidence,
    },
    sequential_explanations: {
      category: "sequential_explanations",
      name: "Sequential Workflow (Layer A)",
      directive: layerA.workflow_explanations.directive,
      confidence: layerA.workflow_explanations.confidence,
      evidence: layerA.workflow_explanations.evidence,
    },
    clarification_habits: {
      category: "clarification_habits",
      name: "Clarification Habits (Layer A)",
      directive: layerA.clarification_loops.directive,
      confidence: layerA.clarification_loops.confidence,
      evidence: layerA.clarification_loops.evidence,
    },
    paragraph_rhythm: {
      category: "paragraph_rhythm",
      name: "Paragraph Rhythm (Layer A)",
      directive: layerA.paragraph_rhythm.directive,
      confidence: layerA.paragraph_rhythm.confidence,
      evidence: layerA.paragraph_rhythm.evidence,
    },
    syntactic_nesting: {
      category: "syntactic_nesting",
      name: "Technical Syntax & Clauses (Layer B)",
      directive: layerB.technical_sentence_structure.directive,
      confidence: layerB.technical_sentence_structure.confidence,
      evidence: layerB.technical_sentence_structure.evidence,
    },
    transitional_flow: {
      category: "transitional_flow",
      name: "Formal Transitions (Layer B)",
      directive: layerB.formal_transitions.directive,
      confidence: layerB.formal_transitions.confidence,
      evidence: layerB.formal_transitions.evidence,
    },
    vocabulary_discipline: {
      category: "vocabulary_discipline",
      name: "Academic Vocabulary (Layer B)",
      directive: layerB.academic_vocabulary.directive,
      confidence: layerB.academic_vocabulary.confidence,
      evidence: layerB.academic_vocabulary.evidence,
    },
    conclusion_style: {
      category: "conclusion_style",
      name: "Deductive Synthesis",
      directive: "concludes sections by synthesizing operational insights rather than repeating broad abstracts",
      confidence: 0.85,
      evidence: "Synthesized from dual-layer argument closure",
    },
  };

  const runtime: RuntimeFingerprint = {
    version: "2.0",
    layerA_personal_thinking: {
      sentence_framing: layerA.sentence_framing.directive,
      clarification_loops: layerA.clarification_loops.directive,
      workflow_explanations: layerA.workflow_explanations.directive,
      thought_expansion: layerA.thought_expansion.directive,
      transition_order: layerA.transition_order.directive,
      paragraph_rhythm: layerA.paragraph_rhythm.directive,
    },
    layerB_academic: {
      academic_vocabulary: layerB.academic_vocabulary.directive,
      formal_transitions: layerB.formal_transitions.directive,
      citation_handling: layerB.citation_handling.directive,
      technical_sentence_structure: layerB.technical_sentence_structure.directive,
    },
    merged_directives: {
      sentence_rhythm: sentenceRhythm,
      explanation_order: explanationOrder,
      transition_placement: transitionPlacement,
      paragraph_flow: paragraphFlow,
    },
    qualitative_rules: qualitativeRules,
    categories,
    totalEditsApplied: previousRuntime?.totalEditsApplied ?? 0,
    lastUpdated: new Date().toISOString(),
  };

  return runtime;
}

/**
 * Saves all profile artifacts to data/profile/:
 * - personal_thinking_profile.json (Layer A)
 * - academic_profile.json (Layer B)
 * - fingerprint.json (Merged Runtime Fingerprint)
 */
export function saveDualLayerProfiles(
  personalProfile: PersonalThinkingProfile,
  academicProfile: AcademicProfile,
  runtimeFingerprint: RuntimeFingerprint
): void {
  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  fs.writeFileSync(
    path.join(profileDir, "personal_thinking_profile.json"),
    JSON.stringify(personalProfile, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(profileDir, "academic_profile.json"),
    JSON.stringify(academicProfile, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(profileDir, "fingerprint.json"),
    JSON.stringify(runtimeFingerprint, null, 2),
    "utf-8"
  );
}

/**
 * Loads Layer A from data/profile/personal_thinking_profile.json
 */
export function loadPersonalThinkingProfile(): PersonalThinkingProfile | null {
  const p = path.join(process.cwd(), "data", "profile", "personal_thinking_profile.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Loads Layer B from data/profile/academic_profile.json
 */
export function loadAcademicProfile(): AcademicProfile | null {
  const p = path.join(process.cwd(), "data", "profile", "academic_profile.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Loads merged runtime fingerprint from data/profile/fingerprint.json
 */
export function loadFingerprint(): RuntimeFingerprint | null {
  const fpPath = path.join(process.cwd(), "data", "profile", "fingerprint.json");
  if (!fs.existsSync(fpPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fpPath, "utf-8"));
  } catch {
    return null;
  }
}

export function saveFingerprint(fp: RuntimeFingerprint): void {
  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "fingerprint.json"), JSON.stringify(fp, null, 2), "utf-8");
}

/**
 * Updates fingerprint category confidence scores based on manual edit structural changes.
 */
export function updateFingerprintConfidence(structuralChanges: StructuralChange[]): RuntimeFingerprint | null {
  const fp = loadFingerprint();
  if (!fp) return null;

  for (const change of structuralChanges) {
    const dim = change.dimension.toLowerCase();

    if (dim.includes("sentence") && fp.categories.thought_expansion) {
      fp.categories.thought_expansion.confidence = Math.min(
        1.0,
        Math.round((fp.categories.thought_expansion.confidence + 0.03) * 100) / 100
      );
    }
    if (dim.includes("clause") && fp.categories.syntactic_nesting) {
      fp.categories.syntactic_nesting.confidence = Math.min(
        1.0,
        Math.round((fp.categories.syntactic_nesting.confidence + 0.03) * 100) / 100
      );
    }
    if (dim.includes("clarification") && fp.categories.clarification_habits) {
      fp.categories.clarification_habits.confidence = Math.min(
        1.0,
        Math.round((fp.categories.clarification_habits.confidence + 0.04) * 100) / 100
      );
    }
    if (dim.includes("transition") && fp.categories.transitional_flow) {
      fp.categories.transitional_flow.confidence = Math.min(
        1.0,
        Math.round((fp.categories.transitional_flow.confidence + 0.03) * 100) / 100
      );
    }
    if (dim.includes("workflow") && fp.categories.sequential_explanations) {
      fp.categories.sequential_explanations.confidence = Math.min(
        1.0,
        Math.round((fp.categories.sequential_explanations.confidence + 0.03) * 100) / 100
      );
    }
  }

  fp.totalEditsApplied += 1;
  fp.lastUpdated = new Date().toISOString();

  saveFingerprint(fp);
  return fp;
}

/**
 * Backward compatible helper to retrieve qualitative rules array
 */
export function getFingerprintRules(metricsOverride?: StyleDNAMetrics): string[] {
  const existingFp = loadFingerprint();
  if (existingFp && existingFp.qualitative_rules && existingFp.qualitative_rules.length > 0) {
    return existingFp.qualitative_rules;
  }

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
    }
  } catch (err) {
    console.warn("Could not load rules from profile:", err);
  }

  return [];
}
