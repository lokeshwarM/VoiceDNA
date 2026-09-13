"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, Sparkles, ChevronDown, ChevronUp, BookOpen, Hash, Binary, Dna, ArrowRight, Check } from "lucide-react";
import { FidelityReport, VerbatimReport } from "@/lib/ai/fidelity-guard";
import { VoiceMatchReport } from "@/lib/ai/voice-match";
import { RewriteValidationReport } from "@/lib/ai/rewrite-engine";

interface FidelityBadgesProps {
  fidelity?: FidelityReport | null;
  novelty?: VerbatimReport | null;
  voiceMatch?: VoiceMatchReport | null;
  validation?: RewriteValidationReport | null;
}

export const FidelityBadges: React.FC<FidelityBadgesProps> = ({ fidelity, novelty, voiceMatch, validation }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!fidelity) return null;

  const citationsTotal = fidelity.citationsFound.length;
  const numbersTotal = fidelity.numbersFound.length;
  const equationsTotal = fidelity.equationsFound.length;

  const citationsOk = fidelity.citationsMissing.length === 0;
  const numbersOk = fidelity.numbersMissing.length === 0;
  const equationsOk = fidelity.equationsMissing.length === 0;
  const noveltyOk = novelty?.isClean ?? true;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Overall Score */}
        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${
              fidelity.allPreserved
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-200">Fidelity Guard:</span>
              <span
                className={`text-xs font-mono font-bold ${
                  fidelity.fidelityScore >= 95 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {fidelity.fidelityScore}% Intact
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {fidelity.allPreserved
                ? "Technical figures, citations, & formulas strictly maintained"
                : "Notice: Some draft figures or citations may have been modified"}
            </p>
          </div>
        </div>

        {/* Individual Pillar Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Citations */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              citationsOk
                ? "bg-slate-800/80 text-emerald-300 border-emerald-800/40"
                : "bg-amber-950/40 text-amber-300 border-amber-700/50"
            }`}
            title={citationsTotal > 0 ? `${fidelity.citationsPreserved.length}/${citationsTotal} citations preserved` : "No citations in draft"}
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>Citations:</span>
            <span className="font-mono font-semibold">
              {citationsTotal > 0 ? `${fidelity.citationsPreserved.length}/${citationsTotal}` : "None"}
            </span>
            {citationsOk ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            )}
          </div>

          {/* Numbers & Data */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              numbersOk
                ? "bg-slate-800/80 text-emerald-300 border-emerald-800/40"
                : "bg-amber-950/40 text-amber-300 border-amber-700/50"
            }`}
            title={numbersTotal > 0 ? `${fidelity.numbersPreserved.length}/${numbersTotal} numbers & measurements matched` : "No figures in draft"}
          >
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            <span>Figures:</span>
            <span className="font-mono font-semibold">
              {numbersTotal > 0 ? `${fidelity.numbersPreserved.length}/${numbersTotal}` : "None"}
            </span>
            {numbersOk ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            )}
          </div>

          {/* Equations */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              equationsOk
                ? "bg-slate-800/80 text-emerald-300 border-emerald-800/40"
                : "bg-amber-950/40 text-amber-300 border-amber-700/50"
            }`}
            title={equationsTotal > 0 ? `${fidelity.equationsPreserved.length}/${equationsTotal} formulas intact` : "No equations in draft"}
          >
            <Binary className="w-3.5 h-3.5 text-slate-400" />
            <span>Equations:</span>
            <span className="font-mono font-semibold">
              {equationsTotal > 0 ? `${fidelity.equationsPreserved.length}/${equationsTotal}` : "None"}
            </span>
            {equationsOk ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            )}
          </div>

          {/* Novelty / Zero Verbatim */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              noveltyOk
                ? "bg-indigo-950/50 text-indigo-300 border-indigo-800/50"
                : "bg-amber-950/40 text-amber-300 border-amber-700/50"
            }`}
            title="Guarantees sentences are never copied verbatim from previous training documents"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Zero Verbatim:</span>
            <span className="font-mono font-semibold">{noveltyOk ? "100% Novel" : "Overlap Flagged"}</span>
          </div>

          {/* Lexical Change Rate Badge */}
          {validation && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                validation.preservationGoalMet
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                  : "bg-amber-950/40 text-amber-300 border-amber-800/40"
              }`}
              title={`Lexical change rate: ${validation.wordsChangedPct}% of words modified. Preserve target: <20%.`}
            >
              <span>Lexical Diff:</span>
              <span className="font-mono font-bold">{validation.wordsChangedPct}%</span>
              {validation.preservationGoalMet && (
                <Check className="w-3 h-3 text-emerald-400" />
              )}
            </div>
          )}

          {/* Deterministic Voice Match Pill */}
          {voiceMatch && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                voiceMatch.overallScore >= 80
                  ? "bg-purple-950/40 text-purple-300 border-purple-800/50"
                  : "bg-slate-800/80 text-purple-300 border-purple-800/30"
              }`}
              title={voiceMatch.summary}
            >
              <Dna className="w-3.5 h-3.5 text-purple-400" />
              <span>Voice Match:</span>
              <span className="font-mono font-bold text-purple-200">{voiceMatch.overallScore}%</span>
              {validation && validation.voiceMatchDelta !== undefined && (
                <span className={`font-mono text-[10px] ${validation.voiceMatchDelta >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  ({validation.voiceMatchDelta >= 0 ? `+${validation.voiceMatchDelta}` : validation.voiceMatchDelta}%)
                </span>
              )}
            </div>
          )}

          {/* Details Toggle */}
          {(citationsTotal > 0 || numbersTotal > 0 || equationsTotal > 0 || !noveltyOk || Boolean(voiceMatch) || Boolean(validation)) && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="Toggle detailed entity preservation & voice match breakdown"
            >
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Breakdown Drawer */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs space-y-3 text-slate-300">
          {/* Detailed Validation Report */}
          {validation && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  Identity Preservation & Validation Report ({validation.mode.toUpperCase()})
                </span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                    validation.preservationGoalMet
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/50"
                      : "bg-amber-950/60 text-amber-300 border-amber-800/50"
                  }`}>
                    {validation.wordsChangedPct}% Words Changed {validation.mode === "preserve" && (validation.preservationGoalMet ? "(< 20% Goal Met)" : "(> 20% Threshold)")}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/50">
                    {validation.sentencesPreserved}/{validation.totalInputSentences} Sentences Preserved
                  </span>
                </div>
              </div>

              {validation.selectedCandidateReason && (
                <p className="text-[11px] text-slate-400 font-mono italic">
                  Decoding strategy: {validation.selectedCandidateReason}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                {/* Structural Edits */}
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                    Structural Invariants
                  </span>
                  <ul className="space-y-1 text-[11px] text-slate-400">
                    {validation.structuralEdits.map((edit, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{edit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Voice Match Comparison */}
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                    Voice Match Calibration
                  </span>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Input Draft Match:</span>
                      <span className="font-mono text-slate-300">{validation.inputVoiceMatch.overallScore}%</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Output Rewrite Match:</span>
                      <span className="font-mono text-purple-300 font-bold">{validation.outputVoiceMatch.overallScore}%</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 pt-0.5 border-t border-slate-800">
                      <span>Improvement Delta:</span>
                      <span className={`font-mono font-bold ${validation.voiceMatchDelta >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                        {validation.voiceMatchDelta >= 0 ? `+${validation.voiceMatchDelta}` : validation.voiceMatchDelta}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lexical Substitutions */}
              {validation.lexicalSubstitutions.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Lexical Substitutions ({validation.lexicalSubstitutions.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    {validation.lexicalSubstitutions.map((sub, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1">
                        <span className="text-rose-400/80 line-through">{sub.original}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-500" />
                        <span className="text-emerald-300">{sub.replacement}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* 6-Dimension Deterministic Voice Match Breakdown */}
          {voiceMatch && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-purple-900/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Dna className="w-3.5 h-3.5 text-purple-400" />
                  Deterministic Voice Match Breakdown (Compared Exclusively Against Your Profile)
                </span>
                <span className="font-mono text-xs font-bold text-purple-200 bg-purple-950/50 px-2 py-0.5 rounded border border-purple-800/40">
                  {voiceMatch.overallScore}% Overall
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{voiceMatch.summary}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1 text-[11px]">
                {Object.entries(voiceMatch.dimensions).map(([key, dim]) => (
                  <div key={key} className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-medium">{dim.name}</span>
                      <span className={`font-mono font-bold ${dim.score >= 80 ? 'text-emerald-400' : dim.score >= 65 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {dim.score}%
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      target: {dim.target} | actual: {dim.measured}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {dim.details}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {citationsTotal > 0 && (
            <div>
              <span className="font-semibold text-slate-400">Preserved Citations: </span>
              <span className="font-mono text-emerald-300">{fidelity.citationsPreserved.join(", ") || "None"}</span>
              {fidelity.citationsMissing.length > 0 && (
                <span className="text-amber-400 ml-2 font-mono">
                  (Missing: {fidelity.citationsMissing.join(", ")})
                </span>
              )}
            </div>
          )}

          {numbersTotal > 0 && (
            <div>
              <span className="font-semibold text-slate-400">Preserved Figures: </span>
              <span className="font-mono text-emerald-300">{fidelity.numbersPreserved.join(", ") || "None"}</span>
              {fidelity.numbersMissing.length > 0 && (
                <span className="text-amber-400 ml-2 font-mono">
                  (Missing: {fidelity.numbersMissing.join(", ")})
                </span>
              )}
            </div>
          )}

          {equationsTotal > 0 && (
            <div>
              <span className="font-semibold text-slate-400">Preserved Equations: </span>
              <span className="font-mono text-emerald-300">{fidelity.equationsPreserved.join(" | ") || "None"}</span>
              {fidelity.equationsMissing.length > 0 && (
                <span className="text-amber-400 ml-2 font-mono">
                  (Missing: {fidelity.equationsMissing.join(" | ")})
                </span>
              )}
            </div>
          )}

          {novelty && !novelty.isClean && novelty.verbatimPhrases.length > 0 && (
            <div className="p-2 rounded bg-amber-950/40 border border-amber-800/40 text-amber-200">
              <span className="font-semibold">Corpus Overlap Warning: </span>
              <span>The following 6-gram matches appeared in past papers:</span>
              <p className="font-mono text-[11px] mt-1 italic">"{novelty.verbatimPhrases.join('" | "')}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
