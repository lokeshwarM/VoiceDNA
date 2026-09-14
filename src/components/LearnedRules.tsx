"use client";

import React, { useState } from "react";
import { Brain, Plus, Trash2, CheckCircle2, XCircle, Sparkles, Filter, AlertCircle } from "lucide-react";
import { LearnedRule } from "@/lib/db/queries";

interface LearnedRulesProps {
  rules: LearnedRule[];
  onRuleToggled: (id: string, is_active: boolean) => void;
  onRuleDeleted: (id: string) => void;
  onRuleAdded: () => void;
}

export const LearnedRules: React.FC<LearnedRulesProps> = ({
  rules,
  onRuleToggled,
  onRuleDeleted,
  onRuleAdded,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [category, setCategory] = useState<LearnedRule["category"]>("vocabulary");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText.trim()) return;

    try {
      setSaving(true);
      const res = await fetch("/api/voice/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule_text: newRuleText.trim(),
          category,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewRuleText("");
        setModalOpen(false);
        setFeedback("Custom rule added!");
        setTimeout(() => setFeedback(null), 3000);
        onRuleAdded();
      }
    } catch (err: any) {
      setFeedback(`Failed to add rule: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "vocabulary":
        return "bg-indigo-950/60 text-indigo-300 border-indigo-800/50";
      case "syntax":
        return "bg-purple-950/60 text-purple-300 border-purple-800/50";
      case "brevity":
        return "bg-emerald-950/60 text-emerald-300 border-emerald-800/50";
      case "tone":
        return "bg-sky-950/60 text-sky-300 border-sky-800/50";
      case "structure":
        return "bg-amber-950/60 text-amber-300 border-amber-800/50";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Brain className="w-4 h-4" />
            </span>
            <h1 className="text-base font-bold text-white">Learned Stylistic Preferences ({rules.length})</h1>
          </div>
          <p className="mt-1 text-xs text-slate-400 max-w-xl">
            VoiceDNA continuously extracts your precise writing preferences every time you manually edit a rewritten output in the Rewrite Studio. These rules are prioritized above all else in subsequent drafts.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="self-start md:self-center flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom Rule</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs">
          {feedback}
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
            <Brain className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
            <p className="text-xs">No learned rules yet.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              In the Rewrite Studio, edit any rewritten text and click <span className="text-indigo-400 font-semibold">"Accept & Learn from My Edits"</span> to train VoiceDNA.
            </p>
          </div>
        ) : (
          rules.map((rule) => {
            const active = rule.is_active === 1;
            return (
              <div
                key={rule.id}
                className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm ${
                  active
                    ? "bg-slate-900/80 border-slate-800/90"
                    : "bg-slate-950/50 border-slate-900 opacity-60"
                }`}
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${getCategoryColor(rule.category)}`}>
                      {rule.category}
                    </span>

                    {/* Confidence & Evidence Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                        (rule.confidence_pct ?? 100) >= 75
                          ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/40"
                          : (rule.confidence_pct ?? 100) >= 60
                          ? "bg-amber-950/50 text-amber-300 border-amber-800/40"
                          : "bg-rose-950/50 text-rose-300 border-rose-800/40"
                      }`}
                      title={`Confidence: ${rule.confidence_pct ?? 100}% | Observed: ${rule.observed_count ?? 1} (${rule.accepted_count ?? 1} corroborating, ${rule.rejected_count ?? 0} contradictory)`}
                    >
                      {rule.confidence_pct ?? 100}% Conf • {rule.accepted_count ?? 1}/{rule.observed_count ?? 1} Obs
                    </span>

                    {(rule.observed_count ?? 1) < 2 && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                        title="Provisional rule: requires at least 2 corroborating observations before becoming active in rewrite engine"
                      >
                        Provisional
                      </span>
                    )}

                    <span className="text-xs text-slate-400">
                      {new Date(rule.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-slate-100">{rule.rule_text}</p>

                  {(rule.before_snippet || rule.after_snippet) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-1 text-slate-400">
                      {rule.before_snippet && (
                        <span>
                          <span className="text-rose-400/80 line-through">Replaced:</span> "{rule.before_snippet}"
                        </span>
                      )}
                      {rule.after_snippet && (
                        <span>
                          <span className="text-emerald-400">Preferred:</span> "{rule.after_snippet}"
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right actions: Toggle switch and delete */}
                <div className="flex items-center gap-3 self-end md:self-center">
                  <button
                    onClick={() => onRuleToggled(rule.id, !active)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition ${
                      active
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/40"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    {active ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>{active ? "Active" : "Disabled"}</span>
                  </button>

                  <button
                    onClick={() => onRuleDeleted(rule.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Custom Rule Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAddRule}
            className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 space-y-4 animate-in fade-in zoom-in-95"
          >
            <h2 className="text-base font-semibold text-white">Add Custom Writing Rule</h2>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Rule Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="vocabulary">Vocabulary (Preferred terms, word replacements)</option>
                <option value="syntax">Syntax (Sentence structure, clause order)</option>
                <option value="brevity">Brevity (Trimming filler, conciseness)</option>
                <option value="tone">Tone (Directness, natural author voice, clarity)</option>
                <option value="structure">Structure (Paragraph flow, explanation order)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Imperative Rule Description</label>
              <textarea
                rows={3}
                placeholder="e.g. Always write out single-digit numbers as words, or Never use conversational transitions like Obviously or Clearly."
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Rule"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
