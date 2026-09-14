"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Edit3,
  Eye,
  GitCompare,
  Brain,
  FileText,
  AlertCircle,
  Zap,
  Terminal,
} from "lucide-react";
import confetti from "canvas-confetti";
import { DiffViewer } from "./DiffViewer";
import { FidelityBadges } from "./FidelityBadges";
import { FidelityReport, VerbatimReport } from "@/lib/ai/fidelity-guard";
import { VoiceMatchReport } from "@/lib/ai/voice-match";
import { RewriteMode, RewriteValidationReport, RewriteTimings } from "@/lib/ai/rewrite-engine";

interface RewriteStudioProps {
  initialDraft?: string;
  initialOutput?: string;
  initialSection?: string;
  initialId?: string;
  onRuleLearned?: () => void;
  activeRulesCount?: number;
}

const SECTION_OPTIONS = [
  "Abstract",
  "Introduction & Motivation",
  "Literature Review & Related Work",
  "Methodology & Experimental Design",
  "Results & Quantitative Findings",
  "Discussion & Implications",
  "Conclusion & Future Directions",
  "Term Paper / Academic Essay",
  "General Academic",
];

export const RewriteStudio: React.FC<RewriteStudioProps> = ({
  initialDraft = "",
  initialOutput = "",
  initialSection = "Methodology & Experimental Design",
  initialId = "",
  onRuleLearned,
  activeRulesCount = 0,
}) => {
  const [draftInput, setDraftInput] = useState(initialDraft);
  const [sectionType, setSectionType] = useState(initialSection);
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>("exact_voice");
  const [customInstructions, setCustomInstructions] = useState("");
  const [rewrittenOutput, setRewrittenOutput] = useState(initialOutput);
  const [userEditedText, setUserEditedText] = useState(initialOutput);
  const [currentRewriteId, setCurrentRewriteId] = useState(initialId);

  const [outputViewMode, setOutputViewMode] = useState<"rendered" | "diff" | "editor">("rendered");
  const [loading, setLoading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedOllamaCmd, setCopiedOllamaCmd] = useState(false);

  const [fidelityReport, setFidelityReport] = useState<FidelityReport | null>(null);
  const [noveltyReport, setNoveltyReport] = useState<VerbatimReport | null>(null);
  const [voiceMatchReport, setVoiceMatchReport] = useState<VoiceMatchReport | null>(null);
  const [validationReport, setValidationReport] = useState<RewriteValidationReport | null>(null);
  const [rewriteTimings, setRewriteTimings] = useState<RewriteTimings | null>(null);
  const [learnedFeedback, setLearnedFeedback] = useState<{ ruleText: string; category: string } | null>(null);
  const [truncationInfo, setTruncationInfo] = useState<{
    isTruncated: boolean;
    message?: string;
    generatedTokens?: number;
    maxTokens?: number;
  } | null>(null);

  // Sync if props change (e.g. from history click)
  useEffect(() => {
    if (initialDraft) setDraftInput(initialDraft);
    if (initialOutput) {
      setRewrittenOutput(initialOutput);
      setUserEditedText(initialOutput);
    }
    if (initialSection) setSectionType(initialSection);
    if (initialId) setCurrentRewriteId(initialId);
  }, [initialDraft, initialOutput, initialSection, initialId]);

  const hasManualEdits =
    rewrittenOutput.trim().length > 0 &&
    userEditedText.trim().length > 0 &&
    rewrittenOutput.trim() !== userEditedText.trim();

  // Primary Rewrite Trigger with NDJSON Streaming
  const handleRewrite = async () => {
    if (!draftInput.trim()) {
      setErrorMessage("Please enter a rough draft or bullet points to rewrite.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      setLearnedFeedback(null);
      setTruncationInfo(null);
      setRewrittenOutput("");
      setFidelityReport(null);
      setNoveltyReport(null);
      setVoiceMatchReport(null);
      setValidationReport(null);
      setRewriteTimings(null);

      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftInput,
          sectionType,
          customInstructions,
          mode: rewriteMode,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = errText;
        try {
          const j = JSON.parse(errText);
          if (j.error) msg = j.error;
        } catch {}
        throw new Error(msg || `Server error (${res.status})`);
      }

      if (!res.body) {
        throw new Error("No response body stream received.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "token") {
            accumulated += event.token;
            // Progressive streaming: update output view immediately.
            // Do NOT mutate userEditedText during streaming.
            setRewrittenOutput(accumulated);
          } else if (event.type === "done") {
            const data = event.result;
            setRewrittenOutput(data.rewrittenOutput);
            setUserEditedText(data.rewrittenOutput);
            setCurrentRewriteId(data.id);
            setFidelityReport(data.fidelity);
            setNoveltyReport(data.novelty);
            setVoiceMatchReport(data.voiceMatch || null);
            setValidationReport(data.validation || null);
            setRewriteTimings(data.timings || null);
            setOutputViewMode("rendered");

            // Handle truncation detection:
            if (data.truncated) {
              const tokenMsg = typeof data.generatedTokens === "number" ? ` (Generated: ${data.generatedTokens} tokens)` : "";
              const msg = `Output truncated — increase generation limit and retry${tokenMsg}`;
              setTruncationInfo({
                isTruncated: true,
                message: msg,
                generatedTokens: data.generatedTokens,
                maxTokens: data.maxTokens,
              });
              setErrorMessage(msg);
            } else {
              setTruncationInfo(null);
              // Celebrate high fidelity ONLY when output is complete and not truncated
              if (data.fidelity?.allPreserved) {
                confetti({
                  particleCount: 30,
                  spread: 50,
                  origin: { y: 0.8 },
                  colors: ["#6366f1", "#10b981", "#3b82f6"],
                });
              }
            }
          } else if (event.type === "error") {
            throw new Error(event.error || "Failed to generate academic rewrite.");
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Trigger feedback loop: learn from user edits
  const handleLearnFromEdits = async () => {
    if (!hasManualEdits) return;

    try {
      setLearning(true);
      const res = await fetch("/api/voice/learn-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalOutput: rewrittenOutput,
          userEditedText: userEditedText,
          rewriteId: currentRewriteId,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to learn from edits.");
      }

      setLearnedFeedback({
        ruleText: data.rule.rule_text,
        category: data.rule.category,
      });

      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 },
        colors: ["#10b981", "#8b5cf6", "#f59e0b"],
      });

      if (onRuleLearned) onRuleLearned();
    } catch (err: any) {
      setErrorMessage(`Learning error: ${err.message}`);
    } finally {
      setLearning(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = userEditedText || rewrittenOutput;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Ctrl+Enter shortcut
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRewrite();
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner with Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-mono">
            <Zap className="w-3 h-3 text-indigo-400" />
            <span>Shortcut: <kbd className="text-[10px] bg-slate-800 px-1 rounded">Ctrl+Enter</kbd></span>
          </span>
          {activeRulesCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 font-mono">
              <Brain className="w-3 h-3" />
              <span>{activeRulesCount} learned preferences applied</span>
            </span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs shadow-lg space-y-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-amber-300">
                {errorMessage.includes("Output truncated") || errorMessage.includes("truncated")
                  ? "Output Truncation Warning"
                  : errorMessage.toLowerCase().includes("ollama") || errorMessage.includes("11434")
                  ? "Local Ollama Engine Notice"
                  : "Generation Notice"}
              </span>
              <p className="mt-1 text-slate-300 whitespace-pre-wrap">{errorMessage}</p>
            </div>
          </div>

          {(errorMessage.toLowerCase().includes("ollama") || errorMessage.includes("11434")) && (
            <div className="p-3 rounded-xl bg-black/75 border border-amber-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-mono text-emerald-300 text-xs">
                <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-bold">ollama run qwen3:8b</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText("ollama run qwen3:8b");
                  setCopiedOllamaCmd(true);
                  setTimeout(() => setCopiedOllamaCmd(false), 2000);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm"
              >
                {copiedOllamaCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedOllamaCmd ? "Copied Command!" : "Copy: ollama run qwen3:8b"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Dual-Panel Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch min-h-[640px]">
        {/* Left Column: Draft Input Workbench */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl space-y-4">
          {/* Section & Rewrite Mode Controls Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Configuration
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {draftInput.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-1">
                  Target Section
                </label>
                <select
                  value={sectionType}
                  onChange={(e) => setSectionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 shadow-inner"
                >
                  {SECTION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium text-indigo-300 mb-1 flex items-center justify-between">
                  <span>Compiler Mode</span>
                  {rewriteMode === "exact_voice" && (
                    <span className="text-[9px] text-emerald-400 font-mono">Author Fingerprint</span>
                  )}
                  {rewriteMode === "light_cleanup" && (
                    <span className="text-[9px] text-blue-400 font-mono">Grammar &amp; Punctuation</span>
                  )}
                  {rewriteMode === "rewrite" && (
                    <span className="text-[9px] text-purple-400 font-mono">Restructure</span>
                  )}
                </label>
                <select
                  value={rewriteMode}
                  onChange={(e) => setRewriteMode(e.target.value as RewriteMode)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-indigo-900/50 text-xs font-medium text-indigo-200 focus:outline-none focus:border-indigo-500 shadow-inner"
                >
                  <option value="exact_voice">Exact Voice (Default)</option>
                  <option value="light_cleanup">Light Cleanup</option>
                  <option value="rewrite">Rewrite</option>
                </select>
              </div>
            </div>
          </div>

          {/* Draft Input Area */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            <textarea
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste your rough notes, bullet points, messy paragraphs, formulas, and citations here..."
              className="flex-1 w-full p-4 rounded-xl bg-slate-950/90 border border-slate-800/80 font-serif text-sm leading-relaxed text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
            />
          </div>

          {/* Optional Directives */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Custom Nuance / Focus (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Highlight methodological constraints; make topic sentence concise"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={handleRewrite}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-white" />
                <span>Generating Stream...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Transform into My Academic Voice</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Academic Voice Output & Interactive Editor */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl space-y-4">
          {/* Output Toolbar & View Modes */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setOutputViewMode("rendered")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition ${
                  outputViewMode === "rendered"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Rendered</span>
              </button>

              <button
                type="button"
                onClick={() => setOutputViewMode("diff")}
                disabled={!rewrittenOutput || loading}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition disabled:opacity-40 ${
                  outputViewMode === "diff"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Diff View</span>
              </button>

              <button
                type="button"
                onClick={() => setOutputViewMode("editor")}
                disabled={!rewrittenOutput || loading}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition disabled:opacity-40 ${
                  outputViewMode === "editor"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Direct Editor</span>
                {hasManualEdits && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Timing Indicator */}
              {loading && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 text-xs font-medium animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
                  <span>Generating...</span>
                </div>
              )}

              {rewriteTimings && !loading && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300 text-[11px] font-mono">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>{(rewriteTimings.totalGenerationMs / 1000).toFixed(1)}s</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">TTFT: {rewriteTimings.timeToFirstTokenMs}ms</span>
                </div>
              )}

              {/* Copy Button */}
              {rewrittenOutput && !loading && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Fidelity & Novelty Badges */}
          <FidelityBadges
            fidelity={fidelityReport}
            novelty={noveltyReport}
            voiceMatch={voiceMatchReport}
            validation={validationReport}
          />

          {/* Truncation Warning Banner */}
          {truncationInfo?.isTruncated && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-700/60 text-red-200 text-xs shadow-lg flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="font-bold text-red-300">
                  Output truncated — increase generation limit and retry
                </div>
                <div className="text-[11px] text-slate-300">
                  The model reached its token boundary or stopped prematurely before concluding the text.
                  {typeof truncationInfo.generatedTokens === "number" && (
                    <span className="ml-1.5 font-mono text-amber-300 font-semibold">
                      Tokens generated: {truncationInfo.generatedTokens}
                      {truncationInfo.maxTokens ? ` / ${truncationInfo.maxTokens}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Output Content Area */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            {!rewrittenOutput && !loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-slate-800 text-slate-400 text-center">
                <FileText className="w-10 h-10 mb-3 text-slate-400 opacity-60" />
                <h3 className="text-sm font-semibold text-slate-300">Ready for Transformation</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  Enter your draft notes on the left, then click &quot;Transform into My Academic Voice&quot;.
                </p>
              </div>
            ) : loading && !rewrittenOutput ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center space-y-4">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping"></div>
                  <RotateCcw className="w-6 h-6 text-indigo-400 animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Connecting to Local Ollama</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Constructing prompt directives and awaiting token stream...
                  </p>
                </div>
              </div>
            ) : outputViewMode === "rendered" || loading ? (
              <div className="flex-1 p-5 rounded-xl bg-slate-950/90 border border-slate-800/80 font-serif text-sm leading-relaxed text-slate-100 overflow-y-auto whitespace-pre-wrap select-text shadow-inner relative">
                {rewrittenOutput}
                {loading && (
                  <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle"></span>
                )}
              </div>
            ) : outputViewMode === "diff" ? (
              <div className="flex-1">
                <DiffViewer original={draftInput} modified={userEditedText || rewrittenOutput} />
              </div>
            ) : (
              /* Direct Editor Mode */
              <div className="flex-1 flex flex-col space-y-2">
                <textarea
                  value={userEditedText}
                  onChange={(e) => setUserEditedText(e.target.value)}
                  placeholder="Refine and edit text directly here..."
                  className="flex-1 w-full p-4 rounded-xl bg-slate-950/95 border border-indigo-950 font-serif text-sm leading-relaxed text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
                />
                <p className="text-[11px] text-slate-400">
                  Tip: Edit anything to your liking. Click below to permanently teach VoiceDNA your preferences.
                </p>
              </div>
            )}
          </div>

          {/* Adaptive Learning Bar (Shown when manual edits exist) */}
          {hasManualEdits && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border border-emerald-600/40 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-emerald-300">Manual Refinements Detected</h4>
                  <p className="text-[11px] text-slate-300">
                    VoiceDNA can distill your changes into an automatic style rule for future drafts.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLearnFromEdits}
                disabled={learning}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {learning ? (
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                )}
                <span>{learning ? "Distilling Rule..." : "Accept & Learn from My Edits"}</span>
              </button>
            </div>
          )}

          {/* Learned Rule Toast */}
          {learnedFeedback && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-emerald-200 text-xs flex items-start gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-emerald-300">New Preference Memorized: </span>
                <span>"{learnedFeedback.ruleText}"</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
