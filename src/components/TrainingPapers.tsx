"use client";

import React, { useState } from "react";
import { UploadCloud, FileText, Trash2, Plus, Sparkles, Check, AlertCircle, RefreshCw, FileCode, BookOpen } from "lucide-react";
import { TrainingDocument } from "@/lib/db/queries";

interface TrainingPapersProps {
  documents: TrainingDocument[];
  onDocumentAdded: () => void;
  onDocumentDeleted: () => void;
}

export const TrainingPapers: React.FC<TrainingPapersProps> = ({
  documents,
  onDocumentAdded,
  onDocumentDeleted,
}) => {
  const [uploading, setUploading] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setFeedback(null);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({ type: "success", text: `Successfully ingested "${file.name}"! Voice DNA recalibrated.` });
        onDocumentAdded();
      } else {
        setFeedback({ type: "error", text: data.error || "Failed to upload document." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) return;

    try {
      setUploading(true);
      setFeedback(null);

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pasteTitle.trim() || "Manual Academic Notes",
          rawText: pasteContent.trim(),
          fileType: "paste",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({ type: "success", text: "Pasted assignment notes ingested! Voice DNA recalibrated." });
        setPasteTitle("");
        setPasteContent("");
        setPasteModalOpen(false);
        onDocumentAdded();
      } else {
        setFeedback({ type: "error", text: data.error || "Failed to ingest text." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}" from your training corpus?`)) return;

    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: "success", text: `Removed "${title}". Voice DNA recalibrated.` });
        onDocumentDeleted();
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  // Helper to load sample academic paper for fast MVP test
  const handleLoadSamplePaper = async () => {
    const sampleText = `Autonomous distributed consensus protocols fundamentally rely upon bounded message transmission delays to ensure safety and liveness under adversarial network partitions [1]. While classical Byzantine Fault Tolerant (BFT) systems, such as PBFT [2], exhibit $O(N^2)$ message complexity, modern high-throughput state machine replication architectures employ threshold cryptographic signatures to achieve linear $O(N)$ communication complexity. Consequently, transaction finality can be evaluated in under $120\\text{ ms}$ with statistical bounds yielding $p < 0.001$ across $N = 100$ geographically dispersed validator nodes. Furthermore, experimental results obtained from simulated wide-area latency networks demonstrate that cryptographic aggregation reduces bandwidth overhead by $84.2\\%$, thereby mitigating network congestion during adversarial bursts. In contrast to synchronous models, our empirical analysis indicates that partial synchrony preserves safety under arbitrary timing delays, provided the known bound $\\Delta$ holds post Global Stabilization Time (GST).`;

    try {
      setUploading(true);
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Distributed Consensus Benchmark Paper (Sample)",
          rawText: sampleText,
          fileType: "sample",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: "success", text: "Loaded sample academic paper! Voice DNA calibrated." });
        onDocumentAdded();
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Drag & Drop Card */}
        <label className="md:col-span-2 relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-900/40 hover:bg-slate-900/70 transition cursor-pointer group shadow-md">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
          <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition">
            {uploading ? (
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            ) : (
              <UploadCloud className="w-6 h-6 text-indigo-400" />
            )}
          </div>
          <h2 className="mt-3 text-sm font-semibold text-slate-200">
            {uploading ? "Parsing and extracting writing style..." : "Upload Academic Papers & Assignments"}
          </h2>
          <p className="mt-1 text-xs text-slate-400 text-center">
            Supports <span className="font-semibold text-slate-300">PDF, DOCX (Word), TXT, Markdown</span>
          </p>
          <span className="mt-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            Local Parsing via pdf-parse & mammoth
          </span>
        </label>

        {/* Quick Actions Card */}
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between shadow-md space-y-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Quick Ingestion</span>
            <h2 className="mt-1 text-sm font-semibold text-white">Manual Input & Samples</h2>
            <p className="mt-1 text-xs text-slate-400">
              Paste draft notes directly or load a pre-calibrated sample paper.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setPasteModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span>Paste Notes / Assignment</span>
            </button>

            <button
              onClick={handleLoadSamplePaper}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/60 text-indigo-300 transition"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Load Sample Academic Paper</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
              : "bg-rose-950/50 text-rose-300 border-rose-800/60"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Ingested Documents List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Training Corpus ({documents.length})</h2>
            <p className="text-xs text-slate-400">
              Documents from which your cadence, transition markers, and tone are derived.
            </p>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
            <p className="text-xs">No documents uploaded yet. Add a PDF, Word doc, or click "Load Sample Academic Paper".</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {documents.map((doc) => (
              <div key={doc.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-indigo-400 border border-slate-700/60">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">{doc.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded uppercase bg-slate-800 text-slate-400 border border-slate-700">
                        {doc.file_type}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{doc.word_count.toLocaleString()} words</span>
                      <span>•</span>
                      <span>Avg sentence: {doc.metrics?.avgSentenceLength || "N/A"} words</span>
                      {doc.metrics?.detectedCitationStyle && doc.metrics.detectedCitationStyle !== "None" && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-400">{doc.metrics.detectedCitationStyle}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Delete document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paste Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handlePasteSubmit}
            className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 space-y-4 animate-in fade-in zoom-in-95"
          >
            <h2 className="text-base font-semibold text-white">Paste Paper / Assignment Notes</h2>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Document Title</label>
              <input
                type="text"
                placeholder="e.g. Master's Thesis Section 2, Assignment 3"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Academic Text / Notes</label>
              <textarea
                rows={9}
                placeholder="Paste your actual writing here..."
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-serif leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
              >
                {uploading ? "Ingesting..." : "Ingest into Corpus"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
