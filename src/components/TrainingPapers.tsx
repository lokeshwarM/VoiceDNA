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
            <h2 className="mt-1 text-sm font-semibold text-white">Direct Text Ingestion</h2>
            <p className="mt-1 text-xs text-slate-400">
              Paste draft notes, lecture summaries, or assignment text directly into your training corpus.
            </p>
          </div>

          <div>
            <button
              onClick={() => setPasteModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition"
            >
              <FileCode className="w-4 h-4" />
              <span>Paste Notes / Assignment</span>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Training Corpus ({documents.length})</h2>
              {documents.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Voice Learned</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Documents stored locally in <span className="font-mono text-slate-300">uploads/</span> and parsed into a single unified VoiceDNA profile.
            </p>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
            <p className="text-xs">No documents uploaded yet. Upload a PDF, Word doc, or paste your academic notes above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {documents.map((doc) => (
              <div key={doc.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-800 text-indigo-400 border border-slate-700/60 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{doc.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {doc.file_type}
                      </span>
                      {doc.local_path && (
                        <span className="text-[10px] font-mono text-slate-400">
                          (Stored locally)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
                      <span className="text-slate-300">{doc.word_count.toLocaleString()} words</span>
                      <span>•</span>
                      <span>Avg sentence: {doc.metrics?.avgSentenceLength ?? "N/A"} words</span>
                      {doc.metrics?.paragraphLength?.totalParagraphs && (
                        <>
                          <span>•</span>
                          <span>{doc.metrics.paragraphLength.totalParagraphs} paras ({doc.metrics.paragraphLength.averageWords} words/para)</span>
                        </>
                      )}
                      {doc.metrics?.passiveVsActive?.summary && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400">{doc.metrics.passiveVsActive.summary}</span>
                        </>
                      )}
                      {doc.metrics?.detectedCitationStyle && doc.metrics.detectedCitationStyle !== "None" && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-300">{doc.metrics.detectedCitationStyle}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  className="self-end sm:self-center p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
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
