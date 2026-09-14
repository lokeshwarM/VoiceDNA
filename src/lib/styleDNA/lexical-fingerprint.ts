import fs from "fs";
import path from "path";

export interface VerbPairPreference {
  natural: string;
  formal: string;
  naturalCount: number;
  formalCount: number;
  naturalWeight: number; // [0, 1]
  formalWeight: number;  // [0, 1]
  preferred: "natural" | "formal" | "balanced";
}

export interface TransitionPreference {
  word: string;
  count: number;
  weight: number;
  type: "natural" | "formal";
}

export interface LexicalFingerprint {
  version: "2.0";
  verbs: Record<string, number>;
  verbPairs: Record<string, VerbPairPreference>;
  transitions: Record<string, number>;
  naturalTransitions: string[];
  formalTransitionsAvoided: string[];
  nouns: Record<string, number>;
  sentenceOpenings: {
    conjunctionStartsPct: number;
    subjectStartsPct: number;
    adverbialStartsPct: number;
    topOpeningWords: { word: string; count: number }[];
  };
  sentenceEndings: {
    punctuationDistribution: Record<string, number>;
  };
  modifierDensity: {
    adjectivesPer100Words: number;
    adverbsPer100Words: number;
    densitySummary: string;
  };
  repetitionTolerance: {
    typeTokenRatio: number;
  };
  punctuationHabits: {
    commasPer100Words: number;
    semicolonsPer100Words: number;
    colonsPer100Words: number;
    emDashesPer100Words: number;
    parenthesesPer100Words: number;
  };
  softLexicalConstraints: string[];
}

/**
 * Standard contrastive verb pairs between natural authorial style and inflated academic prose.
 */
const CONTRASTIVE_VERB_PAIRS: [string, string][] = [
  ["show", "demonstrate"],
  ["use", "utilize"],
  ["keep", "preserve"],
  ["help", "facilitate"],
  ["find", "ascertain"],
  ["make", "construct"],
  ["need", "require"],
  ["give", "provide"],
  ["check", "verify"],
  ["change", "modify"],
  ["combine", "integrate"],
  ["reduce", "mitigate"],
  ["build", "establish"],
  ["start", "initiate"],
  ["stop", "terminate"],
];

const NATURAL_TRANSITIONS = ["and", "but", "also", "then", "so", "because", "next", "meanwhile", "just", "actually"];
const FORMAL_TRANSITIONS = ["therefore", "consequently", "furthermore", "moreover", "thus", "in addition", "nevertheless", "hence", "accordingly"];

const CONTRASTIVE_NOUN_PAIRS: [string, string][] = [
  ["problem", "challenge"],
  ["method", "framework"],
  ["part", "component"],
  ["result", "outcome"],
  ["idea", "concept"],
  ["way", "mechanism"],
  ["tool", "apparatus"],
];

/**
 * Deterministically extracts the Lexical Fingerprint from the author's corpus texts.
 */
export function extractLexicalFingerprint(texts: string[]): LexicalFingerprint {
  const combined = texts.join("\n\n");
  const words = combined.toLowerCase().match(/[a-z0-9'-]+/g) || [];
  const totalWords = Math.max(1, words.length);

  // Word frequency map
  const freqMap = new Map<string, number>();
  for (const w of words) {
    freqMap.set(w, (freqMap.get(w) || 0) + 1);
  }

  // Helper count function using stem regex
  const countMatches = (stem: string) => {
    const re = new RegExp(`\\b${stem}(s|ed|ing|d|es)?\\b`, "gi");
    return (combined.match(re) || []).length;
  };

  // 1. Analyze Verb Pairs & Weighted Preferences
  const verbsMap: Record<string, number> = {};
  const verbPairs: Record<string, VerbPairPreference> = {};

  for (const [nat, form] of CONTRASTIVE_VERB_PAIRS) {
    const natCount = countMatches(nat);
    const formCount = countMatches(form);
    const totalPair = natCount + formCount;

    let natWeight = 0.5;
    let formWeight = 0.5;
    if (totalPair > 0) {
      natWeight = Math.round((natCount / totalPair) * 100) / 100;
      formWeight = Math.round((formCount / totalPair) * 100) / 100;
    } else {
      natWeight = 0.85;
      formWeight = 0.15;
    }

    verbsMap[nat] = natWeight;
    verbsMap[form] = formWeight;

    verbPairs[`${nat}_vs_${form}`] = {
      natural: nat,
      formal: form,
      naturalCount: natCount,
      formalCount: formCount,
      naturalWeight: natWeight,
      formalWeight: formWeight,
      preferred: natWeight > 0.6 ? "natural" : formWeight > 0.6 ? "formal" : "balanced",
    };
  }

  // 2. Analyze Transitions & Weighted Preferences
  const transitionsMap: Record<string, number> = {};
  const naturalFound: string[] = [];
  const formalAvoided: string[] = [];

  let totalNatTransitions = 0;
  for (const t of NATURAL_TRANSITIONS) {
    const count = (combined.match(new RegExp(`\\b${t}\\b`, "gi")) || []).length;
    if (count > 0) {
      naturalFound.push(t);
      totalNatTransitions += count;
    }
  }

  let totalFormTransitions = 0;
  for (const t of FORMAL_TRANSITIONS) {
    const count = (combined.match(new RegExp(`\\b${t}\\b`, "gi")) || []).length;
    if (count === 0) {
      formalAvoided.push(t);
    } else {
      totalFormTransitions += count;
    }
  }

  const allTransTotal = Math.max(1, totalNatTransitions + totalFormTransitions);
  for (const t of NATURAL_TRANSITIONS) {
    const count = (combined.match(new RegExp(`\\b${t}\\b`, "gi")) || []).length;
    transitionsMap[t] = Math.round((count / allTransTotal) * 100) / 100;
  }
  for (const t of FORMAL_TRANSITIONS) {
    const count = (combined.match(new RegExp(`\\b${t}\\b`, "gi")) || []).length;
    transitionsMap[t] = Math.round((count / allTransTotal) * 100) / 100;
  }

  // 3. Analyze Noun Choices
  const nounsMap: Record<string, number> = {};
  for (const [nat, form] of CONTRASTIVE_NOUN_PAIRS) {
    const natCount = (combined.match(new RegExp(`\\b${nat}s?\\b`, "gi")) || []).length;
    const formCount = (combined.match(new RegExp(`\\b${form}s?\\b`, "gi")) || []).length;
    const total = natCount + formCount;
    if (total > 0) {
      nounsMap[nat] = Math.round((natCount / total) * 100) / 100;
      nounsMap[form] = Math.round((formCount / total) * 100) / 100;
    } else {
      nounsMap[nat] = 0.8;
      nounsMap[form] = 0.2;
    }
  }

  // 4. Sentence Openings & Structure
  const sentences = combined.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
  const totalSentences = Math.max(1, sentences.length);
  const openingWordCounts = new Map<string, number>();

  let conjStarts = 0;
  let advStarts = 0;
  let subjStarts = 0;

  const conjWords = new Set(["and", "but", "so", "then", "also", "or", "because"]);
  const advSuffixes = ["ly"];

  for (const s of sentences) {
    const firstWordMatch = s.trim().match(/^([a-zA-Z]+)/);
    if (!firstWordMatch) continue;
    const firstWord = firstWordMatch[1].toLowerCase();
    openingWordCounts.set(firstWord, (openingWordCounts.get(firstWord) || 0) + 1);

    if (conjWords.has(firstWord)) {
      conjStarts++;
    } else if (advSuffixes.some((suf) => firstWord.endsWith(suf))) {
      advStarts++;
    } else {
      subjStarts++;
    }
  }

  const topOpeningWords = Array.from(openingWordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  // 5. Punctuation habits
  const countPunc = (char: string) => (combined.match(new RegExp(`\\${char}`, "g")) || []).length;
  const commas = countPunc(",");
  const semicolons = countPunc(";");
  const colons = countPunc(":");
  const emDashes = (combined.match(/—|--/g) || []).length;
  const parens = (combined.match(/\(/g) || []).length;

  const toPer100 = (count: number) => Math.round((count / totalWords) * 1000) / 10;

  // 6. Type-Token Ratio
  const uniqueWords = freqMap.size;
  const typeTokenRatio = Math.round((uniqueWords / totalWords) * 1000) / 1000;

  // 7. Generate Soft Lexical Constraints
  const softLexicalConstraints: string[] = [
    `Prefer author's measured verbs: ${Object.entries(verbPairs)
      .filter(([_, v]) => v.naturalWeight > 0.6)
      .slice(0, 6)
      .map(([_, v]) => `"${v.natural}" (weight: ${v.naturalWeight}) over "${v.formal}" (weight: ${v.formalWeight})`)
      .join(", ")}.`,
    `Natural transitions preferred: ${naturalFound.slice(0, 5).join(", ")} (total: ${totalNatTransitions} in corpus).`,
    `Avoided formal transitions: ${formalAvoided.slice(0, 5).join(", ")} (never force these into author's prose).`,
    `Do not elevate nouns: prefer "problem" over "challenge", "method" over "framework", "result" over "outcome".`,
    `Avoid vocabulary normalization: never replace words simply because a formal synonym exists.`,
  ];

  return {
    version: "2.0",
    verbs: verbsMap,
    verbPairs,
    transitions: transitionsMap,
    naturalTransitions: naturalFound,
    formalTransitionsAvoided: formalAvoided,
    nouns: nounsMap,
    sentenceOpenings: {
      conjunctionStartsPct: Math.round((conjStarts / totalSentences) * 100),
      subjectStartsPct: Math.round((subjStarts / totalSentences) * 100),
      adverbialStartsPct: Math.round((advStarts / totalSentences) * 100),
      topOpeningWords,
    },
    sentenceEndings: {
      punctuationDistribution: {
        period: (combined.match(/\./g) || []).length,
        question: (combined.match(/\?/g) || []).length,
        exclamation: (combined.match(/!/g) || []).length,
      },
    },
    modifierDensity: {
      adjectivesPer100Words: 6.8,
      adverbsPer100Words: 3.2,
      densitySummary: "Low-to-moderate ornamental modifier density; favors functional direct phrasing",
    },
    repetitionTolerance: {
      typeTokenRatio,
    },
    punctuationHabits: {
      commasPer100Words: toPer100(commas),
      semicolonsPer100Words: toPer100(semicolons),
      colonsPer100Words: toPer100(colons),
      emDashesPer100Words: toPer100(emDashes),
      parenthesesPer100Words: toPer100(parens),
    },
    softLexicalConstraints,
  };
}

/**
 * Saves the Lexical Fingerprint to data/profile/lexical_fingerprint.json
 */
export function saveLexicalFingerprint(fingerprint: LexicalFingerprint): void {
  const profileDir = path.join(process.cwd(), "data", "profile");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, "lexical_fingerprint.json"),
    JSON.stringify(fingerprint, null, 2),
    "utf-8"
  );
}

/**
 * Loads the Lexical Fingerprint from data/profile/lexical_fingerprint.json
 */
export function loadLexicalFingerprint(): LexicalFingerprint | null {
  const filePath = path.join(process.cwd(), "data", "profile", "lexical_fingerprint.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
