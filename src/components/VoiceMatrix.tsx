"use client";

import React, { useState } from "react";
import {
  Dna,
  RefreshCw,
  Quote,
  Cpu,
  Check,
  FileCode,
  Copy,
  Layers,
  Activity,
  Award,
  Binary,
  Hash,
  BookOpen,
} from "lucide-react";
import { VoiceProfile } from "@/lib/db/queries";

interface VoiceMatrixProps {
  profile: VoiceProfile | null;
  stats: {
    documentCount: number;
    totalWordsAnalyzed: number;
    activeRulesCount: number;
  };
  onRebuildProfile: () => Promise<void>;
}

export const VoiceMatrix: React.FC<VoiceMatrixProps> = ({ profile, stats, onRebuildProfile }) => {
  const [rebuilding, setRebuilding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  const handleRebuild = async () => {
    try {
      setRebuilding(true);
      setFeedback(null);
      await onRebuildProfile();
      setFeedback("Voice Learned: Profile successfully recalibrated!");
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback(`Failed to rebuild: ${err.message}`);
    } finally {
      setRebuilding(false);
    }
  };

  const unified = profile?.unified_profile || (profile?.profile_json ? JSON.parse(profile.profile_json) : null);
  const m = unified?.metrics || unified;

  const totalWords = stats.totalWordsAnalyzed || m?.corpusSummary?.totalWords || 0;
  const hasLearnedData = Boolean(profile && totalWords > 0);

  if (!hasLearnedData) {
    return (
      <div className="p-12 text-center text-slate-400 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
        <Dna className="w-10 h-10 mx-auto mb-3 text-indigo-400 opacity-50" />
        <h3 className="text-sm font-semibold text-slate-300">No Voice DNA Profile Extracted</h3>
        <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
          Add research drafts, lecture notes, or past papers in the Corpus Manager or Training Papers tab to calculate your mathematical writing habit profile.
        </p>
      </div>
    );
  }

  // Helper to format values with Insufficient data fallback
  const fmt = (v: number | null | undefined, suffix = ""): React.ReactNode => {
    if (v === null || v === undefined) {
      return <span className="text-slate-500 font-sans text-xs font-normal">Insufficient data</span>;
    }
    return `${v}${suffix}`;
  };

  // Real computed metrics
  const sentLength = {
    averageWords: m?.sentenceLength?.averageWords ?? null,
    medianWords: m?.sentenceLength?.medianWords ?? null,
    minWords: m?.sentenceLength?.minWords ?? null,
    maxWords: m?.sentenceLength?.maxWords ?? null,
    stdDev: m?.sentenceLength?.stdDev ?? null,
    distribution: m?.sentenceLength?.distribution ?? null,
  };

  const clauseDensity = {
    averageClauses: m?.clauseDensity?.averageClausesPerSentence ?? null,
    subordinateRatio: m?.clauseDensity?.subordinateClauseRatio ?? null,
    coordinationRatio: m?.clauseDensity?.coordinationRatio ?? null,
  };

  const paraLength = {
    averageWords: m?.paragraphLength?.averageWords ?? null,
    averageSentences: m?.paragraphLength?.averageSentences ?? null,
    totalParagraphs: m?.paragraphLength?.totalParagraphs ?? stats.documentCount,
  };

  const transitions = {
    densityPer100Words: m?.transitionFrequency?.densityPer100Words ?? null,
    topTransitions: m?.transitionFrequency?.topTransitions ?? [],
    categoryBreakdown: m?.transitionFrequency?.categoryRatios ?? {},
  };

  const clarif = {
    densityPer100Words: m?.clarificationFrequency?.densityPer100Words ?? null,
    totalClarifications: m?.clarificationFrequency?.totalClarifications ?? 0,
    topMarkers: m?.clarificationFrequency?.topMarkers ?? [],
  };

  const punct = {
    semicolons: m?.punctuationHabits?.semicolonsPer100Words ?? null,
    colons: m?.punctuationHabits?.colonsPer100Words ?? null,
    emDashes: m?.punctuationHabits?.emDashesPer100Words ?? null,
    parentheses: m?.punctuationHabits?.parenthesesPer100Words ?? null,
    commas: m?.punctuationHabits?.commasPer100Words ?? null,
  };

  const vocab = {
    ttr: m?.vocabularyRepetition?.typeTokenRatio ?? null,
    redundancy: m?.vocabularyRepetition?.lexicalRedundancy ?? null,
    hapax: m?.vocabularyRepetition?.hapaxLegomenaRatio ?? null,
  };

  const workflow = {
    score: m?.workflowExplanationTendency?.tendencyScore ?? null,
    proceduralCount: m?.workflowExplanationTendency?.proceduralMarkerCount ?? null,
  };

  const toneDescriptors = profile?.tone_descriptors || ["Analytical", "Precision-Oriented", "Objective"];
  const rhetoricalHabits = profile?.rhetorical_habits || [];

  const handleCopyJson = () => {
    navigator.clipboard.writeText(profile?.profile_json || JSON.stringify(unified || profile, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Voice Learned Status */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Voice Learned</span>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                Extracted from {stats.documentCount} source{stats.documentCount === 1 ? "" : "s"} ({totalWords.toLocaleString()} words)
              </span>

              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                data/profile/voiceDNA.json
              </span>
            </div>

            <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-white">{profile?.name || "Academic Voice Profile"}</h1>
            <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
              Mathematical stylometric habit matrix calculated across measurable writing dimensions without copying previous sentences.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showRawJson ? "Hide JSON Profile" : "View JSON Profile"}</span>
            </button>

            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rebuilding ? "animate-spin" : ""}`} />
              <span>{rebuilding ? "Recalibrating..." : "Rebuild Voice DNA"}</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">{feedback}</span>
          </div>
        )}
      </div>

      {/* Raw JSON Profile Viewer Drawer */}
      {showRawJson && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-white">data/profile/voiceDNA.json</span>
            </div>
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{jsonCopied ? "Copied!" : "Copy JSON"}</span>
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 max-h-72 overflow-y-auto leading-relaxed">
            {profile?.profile_json || JSON.stringify(m, null, 2)}
          </pre>
        </div>
      )}

      {/* Core Measurable Stylometrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Sentence Cadence */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              1. Sentence Cadence
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-900/40">
              {sentLength.stdDev !== null ? `±${sentLength.stdDev} dev` : "Insufficient data"}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {fmt(sentLength.averageWords)}
            </span>
            {sentLength.averageWords !== null && <span className="text-xs text-slate-400">words / sentence</span>}
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Median Words:</span>
              <span className="font-mono text-slate-300">{fmt(sentLength.medianWords, " words")}</span>
            </div>
            <div className="flex justify-between">
              <span>Short / Med / Long:</span>
              <span className="font-mono text-slate-300">
                {sentLength.distribution
                  ? `${sentLength.distribution.shortPercent}% / ${sentLength.distribution.mediumPercent}% / ${sentLength.distribution.longPercent}%`
                  : "Insufficient data"}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Clause Density */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              2. Clause Density
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-900/40">
              Syntactic Nesting
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-purple-300">
              {fmt(clauseDensity.averageClauses)}
            </span>
            {clauseDensity.averageClauses !== null && <span className="text-xs text-slate-400">clauses / sentence</span>}
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Subordination:</span>
              <span className="font-mono text-slate-300">{fmt(clauseDensity.subordinateRatio)}</span>
            </div>
            <div className="flex justify-between">
              <span>Coordination:</span>
              <span className="font-mono text-slate-300">{fmt(clauseDensity.coordinationRatio)}</span>
            </div>
          </div>
        </div>

        {/* 3. Transition Density */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              3. Transitions
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/40">
              {fmt(transitions.densityPer100Words, " / 100w")}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 min-h-[36px] items-center">
            {transitions.topTransitions?.slice(0, 4).map((t: any, i: number) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-900/50"
              >
                {t.word} ({t.count})
              </span>
            ))}
            {(!transitions.topTransitions || transitions.topTransitions.length === 0) && (
              <span className="text-slate-500 text-[10px] italic">Insufficient data</span>
            )}
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
            <span>Causal: {transitions.categoryBreakdown?.causal ?? 0}%</span>
            <span>Contrast: {transitions.categoryBreakdown?.adversative ?? 0}%</span>
          </div>
        </div>

        {/* 4. Workflow Score */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              4. Workflow Score
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-900/40">
              {workflow.proceduralCount !== null ? `${workflow.proceduralCount} markers` : "Insufficient data"}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-amber-300">
              {fmt(workflow.score)}
            </span>
            {workflow.score !== null && <span className="text-xs text-slate-400">/ 100 procedural</span>}
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Lexical TTR:</span>
              <span className="font-mono text-slate-300">{fmt(vocab.ttr)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Guidelines & Fingerprint Rules */}
      <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-200">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">Active Calibrated Voice Guidelines</h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Injected into Ollama</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
          {profile?.synthesized_guidelines || "No guidelines synthesized yet."}
        </div>
      </div>
    </div>
  );
};
