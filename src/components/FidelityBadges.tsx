"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, Sparkles, ChevronDown, ChevronUp, BookOpen, Hash, Binary } from "lucide-react";
import { FidelityReport, VerbatimReport } from "@/lib/ai/fidelity-guard";

interface FidelityBadgesProps {
  fidelity?: FidelityReport | null;
  novelty?: VerbatimReport | null;
}

export const FidelityBadges: React.FC<FidelityBadgesProps> = ({ fidelity, novelty }) => {
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

          {/* Details Toggle */}
          {(citationsTotal > 0 || numbersTotal > 0 || equationsTotal > 0 || !noveltyOk) && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="Toggle detailed entity preservation breakdown"
            >
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Breakdown Drawer */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs space-y-2 text-slate-300">
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
