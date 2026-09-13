"use client";

import React, { useState, useEffect } from "react";
import {
  FolderArchive,
  RefreshCw,
  Dna,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  Database,
  ShieldCheck,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { CorpusFileInfo, CorpusSummary } from "@/lib/styleDNA/corpus";

interface CorpusManagerProps {
  onRebuildComplete?: () => void;
}

export const CorpusManager: React.FC<CorpusManagerProps> = ({ onRebuildComplete }) => {
  const [corpusData, setCorpusData] = useState<CorpusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetchCorpus();
  }, []);

  const fetchCorpus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/corpus");
      const data = await res.json();
      if (data.success) {
        setCorpusData(data);
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to scan corpus directory." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRebuildVoiceDNA = async () => {
    try {
      setRebuilding(true);
      setFeedback(null);
      const res = await fetch("/api/corpus/rebuild", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setCorpusData(data.summary);
        setFeedback({
          type: "success",
          message: data.message || "VoiceDNA successfully recalculated and saved to data/profile/voiceDNA.json!",
        });
        if (onRebuildComplete) {
          onRebuildComplete();
        }
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to rebuild VoiceDNA profile." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setRebuilding(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setFeedback(null);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/corpus", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setCorpusData(data);
        setFeedback({
          type: "success",
          message: `Added "${file.name}" to data/corpus/ and processed into data/processed/. Click "Rebuild VoiceDNA" to refresh metrics.`,
        });
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to upload file to corpus." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Corpus Manager
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                  data/corpus/
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Live scan of TXT, PDF, and DOCX files. Processed text saved in <code className="text-indigo-300 font-mono">data/processed/</code> without overwriting originals.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition shadow-sm">
            <UploadCloud className="w-4 h-4 text-indigo-400" />
            <span>{uploading ? "Ingesting..." : "Add to Corpus"}</span>
            <input
              type="file"
              accept=".txt,.pdf,.docx,.md"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>

          <button
            onClick={fetchCorpus}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-medium transition"
            title="Rescan data/corpus directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            <span>Scan</span>
          </button>

          <button
            onClick={handleRebuildVoiceDNA}
            disabled={rebuilding || (corpusData?.totalFiles || 0) === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition ${
              rebuilding || (corpusData?.totalFiles || 0) === 0
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/20 active:scale-[0.98]"
            }`}
          >
            <Dna className={`w-4 h-4 ${rebuilding ? "animate-spin text-purple-200" : ""}`} />
            <span>{rebuilding ? "Analyzing Habits..." : "Rebuild VoiceDNA"}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/40 border-rose-500/40 text-rose-200"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-200 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Corpus Files</span>
          <div className="mt-1 text-2xl font-bold text-white font-mono">
            {corpusData ? corpusData.totalFiles : "—"}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Inside data/corpus/</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Words</span>
          <div className="mt-1 text-2xl font-bold text-indigo-400 font-mono">
            {corpusData ? corpusData.totalWords.toLocaleString() : "—"}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Extracted raw text</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Sentences</span>
          <div className="mt-1 text-2xl font-bold text-purple-400 font-mono">
            {corpusData ? corpusData.totalSentences.toLocaleString() : "—"}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Syntactic units analyzed</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">VoiceDNA Profile</span>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            {corpusData?.profileExists ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Active Profile</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Pending Rebuild</span>
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
            {corpusData?.lastProfileUpdate
              ? `Saved ${formatDate(corpusData.lastProfileUpdate)}`
              : "data/profile/voiceDNA.json"}
          </span>
        </div>
      </div>

      {/* Main Files Table */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Corpus Files Dashboard</h3>
            <span className="text-xs text-slate-400 font-mono">
              ({corpusData?.files.length || 0} files)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Original files never overwritten</span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-indigo-400 mb-2" />
            <p className="text-xs">Scanning data/corpus/ and synchronizing data/processed/...</p>
          </div>
        ) : !corpusData || corpusData.files.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FolderArchive className="w-10 h-10 mx-auto text-slate-600 mb-3" />
            <h4 className="text-sm font-medium text-slate-300">No training files found in data/corpus/</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Place your TXT, PDF, or DOCX documents into the <code className="text-indigo-300">data/corpus/</code> directory or click &quot;Add to Corpus&quot; above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800/80">
                <tr>
                  <th className="py-3 px-6">File Name</th>
                  <th className="py-3 px-4">Words</th>
                  <th className="py-3 px-4">Sentences</th>
                  <th className="py-3 px-4">Last Modified</th>
                  <th className="py-3 px-4">Processed Cache</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {corpusData.files.map((file) => (
                  <tr key={file.fileName} className="hover:bg-slate-850/50 transition">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold ${
                            file.fileType === "PDF"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : file.fileType === "DOCX"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                          }`}
                        >
                          {file.fileType}
                        </span>
                        <div>
                          <span className="font-medium text-slate-200 text-xs block">{file.fileName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatFileSize(file.sizeBytes)} • data/corpus/{file.fileName}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-indigo-300 font-semibold">
                      {file.words.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-purple-300 font-semibold">
                      {file.sentences.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {formatDate(file.lastModified)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-400 truncate max-w-[180px]">
                          data/processed/{file.processedFileName}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Fingerprint Rules Preview Card */}
      {corpusData?.fingerprintRules && corpusData.fingerprintRules.length > 0 && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-white">VoiceDNA Fingerprint Directives</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Injected into Ollama Rewrite Engine
            </span>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            These dynamic instructions are generated strictly from mathematical metrics in{" "}
            <code className="text-indigo-300 font-mono">data/profile/voiceDNA.json</code>. No previous sentences are stored or exposed.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {corpusData.fingerprintRules.map((rule, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300"
              >
                <div className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 font-mono text-[10px] mt-0.5">
                  {idx + 1}
                </div>
                <span className="leading-relaxed">{rule}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
