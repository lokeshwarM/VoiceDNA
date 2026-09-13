"use client";

import React, { useState, useEffect } from "react";
import { X, Cpu, Key, Globe, Check, AlertCircle, RefreshCw } from "lucide-react";
import { AppSettings } from "@/lib/db/queries";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSettingsUpdated }) => {
  const [settings, setSettings] = useState<AppSettings>({
    provider: "openai",
    openai_api_key: "",
    openai_model: "gpt-4o",
    ollama_base_url: "http://localhost:11434",
    ollama_model: "qwen2.5:7b",
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setSaveMessage(null);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage("Settings saved successfully.");
        if (onSettingsUpdated) onSettingsUpdated();
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err: any) {
      setSaveMessage(`Error saving settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, test: true }),
      });
      const data = await res.json();
      if (data.testResult) {
        setTestResult(data.testResult);
      } else if (data.error) {
        setTestResult({ success: false, message: data.error });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Model & Engine Settings</h2>
              <p className="text-xs text-slate-400">Configure your AI engine (OpenAI or local Ollama)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-5">
          {/* Provider Toggle Tabs */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Active AI Provider</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: "openai" })}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                  settings.provider === "openai"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>OpenAI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-normal">Cloud / GPT</span>
              </button>

              <button
                type="button"
                onClick={() => setSettings({ ...settings, provider: "ollama" })}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                  settings.provider === "ollama"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Ollama</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-normal">Local / Qwen</span>
              </button>
            </div>
          </div>

          {/* OpenAI Configuration */}
          {settings.provider === "openai" && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>OpenAI API Key</span>
                </label>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={settings.openai_api_key}
                  onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Stored securely in your local SQLite database (<span className="font-mono">voicedna.db</span>).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">OpenAI Model</label>
                <select
                  value={settings.openai_model}
                  onChange={(e) => setSettings({ ...settings, openai_model: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="gpt-4o">gpt-4o (Recommended: Superior reasoning & tone)</option>
                  <option value="gpt-4.5-preview">gpt-4.5-preview (Latest deep research model)</option>
                  <option value="gpt-5-preview">gpt-5-preview / gpt-5 (Next-gen)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini (Ultra fast & efficient)</option>
                  <option value="o3-mini">o3-mini (High-precision STEM reasoning)</option>
                </select>
              </div>
            </div>
          )}

          {/* Ollama Configuration */}
          {settings.provider === "ollama" && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ollama Base URL</span>
                </label>
                <input
                  type="text"
                  placeholder="http://localhost:11434"
                  value={settings.ollama_base_url}
                  onChange={(e) => setSettings({ ...settings, ollama_base_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Ollama Model (Qwen)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="qwen2.5:7b"
                    value={settings.ollama_model}
                    onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setSettings({ ...settings, ollama_model: e.target.value });
                    }}
                    value=""
                    className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
                  >
                    <option value="">Presets...</option>
                    <option value="qwen2.5:7b">qwen2.5:7b</option>
                    <option value="qwen2.5:14b">qwen2.5:14b</option>
                    <option value="qwen2.5:32b">qwen2.5:32b</option>
                    <option value="qwen2.5-coder:7b">qwen2.5-coder:7b</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ensure the model is downloaded with <span className="font-mono text-emerald-400">ollama run {settings.ollama_model}</span>.
                </p>
              </div>
            </div>
          )}

          {/* Test Connection Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                testResult.success
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/50"
                  : "bg-rose-950/40 text-rose-300 border-rose-800/50"
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              )}
              <span className="break-words">{testResult.message}</span>
            </div>
          )}

          {saveMessage && (
            <p className="text-xs text-center font-medium text-emerald-400">{saveMessage}</p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
            <span>{testing ? "Pinging..." : "Test Connection"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
