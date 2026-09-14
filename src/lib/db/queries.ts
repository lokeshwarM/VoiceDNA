import { getDb } from "./index";

export interface TrainingDocument {
  id: string;
  title: string;
  file_type: string;
  raw_text: string;
  word_count: number;
  local_path?: string | null;
  is_personal?: number;
  metrics: {
    avgSentenceLength: number;
    sentenceVariance?: string;
    lexicalDiversity: number;
    passiveRatio: number;
    transitionDensity: number;
    detectedCitationStyle: string;
    topTransitions?: string[];
    sampleCount: number;
    paragraphLength?: any;
    punctuationHabits?: any;
    technicalVocabulary?: any;
    passiveVsActive?: any;
  };
  created_at: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  is_active: number;
  tone_descriptors: string[];
  sentence_cadence: any;
  preferred_transitions: string[];
  rhetorical_habits: string[];
  synthesized_guidelines: string;
  profile_json?: string | null;
  unified_profile?: any;
  updated_at: string;
}

export interface LearnedRule {
  id: string;
  rewrite_id: string | null;
  rule_text: string;
  category: "vocabulary" | "syntax" | "brevity" | "tone" | "structure";
  before_snippet: string | null;
  after_snippet: string | null;
  is_active: number;
  observed_count: number;
  accepted_count: number;
  rejected_count: number;
  confidence_pct: number;
  created_at: string;
}

export interface RewriteRecord {
  id: string;
  title: string | null;
  section_type: string;
  draft_input: string;
  rewritten_output: string;
  user_final_text: string | null;
  fidelity_data: {
    citationsFound: string[];
    citationsPreserved: string[];
    numbersFound: string[];
    numbersPreserved: string[];
    equationsFound: string[];
    equationsPreserved: string[];
    fidelityScore: number;
    allPreserved: boolean;
    voiceMatch?: any;
    validation?: any;
    truncated?: boolean;
    truncationReason?: string;
    generatedTokens?: number;
    maxTokens?: number;
    truncationMessage?: string;
  };
  verbatim_check: {
    maxNgramMatch: number;
    isClean: boolean;
    verbatimPhrases: string[];
  };
  mode?: string;
  created_at: string;
}

export interface AppSettings {
  provider: "openai" | "ollama";
  openai_api_key: string;
  openai_model: string;
  ollama_base_url: string;
  ollama_model: string;
}

// --- App Settings ---
export function getAppSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM app_settings").all() as { key: string; value: string }[];
  const settingsMap: Record<string, string> = {};
  for (const r of rows) {
    settingsMap[r.key] = r.value;
  }
  return {
    provider: (settingsMap["provider"] as "openai" | "ollama") || "ollama",
    openai_api_key: settingsMap["openai_api_key"] || "",
    openai_model: settingsMap["openai_model"] || "gpt-4o",
    ollama_base_url: settingsMap["ollama_base_url"] || "http://localhost:11434",
    ollama_model: settingsMap["ollama_model"] || "qwen3:8b",
  };
}

export function updateAppSettings(settings: Partial<AppSettings>) {
  const db = getDb();
  const stmt = db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
  const updateMany = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) {
      stmt.run(k, v);
    }
  });

  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(settings)) {
    if (v !== undefined) {
      entries.push([k, String(v)]);
    }
  }
  updateMany(entries);
}

// --- Documents ---
export function getAllDocuments(): TrainingDocument[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM training_documents ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    ...r,
    is_personal: r.is_personal ?? 1,
    metrics: r.metrics ? JSON.parse(r.metrics) : {},
  }));
}

/**
 * Returns only personal corpus documents that define the author's writing style.
 * Strictly excludes demo and validation documents.
 */
export function getPersonalDocuments(): TrainingDocument[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM training_documents WHERE is_personal = 1 AND title NOT LIKE '%Consensus%' ORDER BY created_at DESC")
    .all() as any[];
  return rows.map((r) => ({
    ...r,
    is_personal: 1,
    metrics: r.metrics ? JSON.parse(r.metrics) : {},
  }));
}

export function addDocument(doc: Omit<TrainingDocument, "metrics"> & { metrics: any; is_personal?: number }) {
  const db = getDb();
  const isPersonal = doc.is_personal ?? (doc.title.toLowerCase().includes("consensus") ? 0 : 1);
  db.prepare(`
    INSERT INTO training_documents (id, title, file_type, raw_text, word_count, local_path, is_personal, metrics, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    doc.id,
    doc.title,
    doc.file_type,
    doc.raw_text,
    doc.word_count,
    doc.local_path || null,
    isPersonal,
    JSON.stringify(doc.metrics),
    doc.created_at
  );
}

export function deleteDocument(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM training_documents WHERE id = ?").run(id);
}

// --- Voice Profile ---
export function getActiveVoiceProfile(): VoiceProfile | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM voice_profiles WHERE is_active = 1 LIMIT 1").get() as any;
  if (!row) return null;
  return {
    ...row,
    tone_descriptors: JSON.parse(row.tone_descriptors || "[]"),
    sentence_cadence: JSON.parse(row.sentence_cadence || "{}"),
    preferred_transitions: JSON.parse(row.preferred_transitions || "[]"),
    rhetorical_habits: JSON.parse(row.rhetorical_habits || "[]"),
    unified_profile: row.profile_json ? JSON.parse(row.profile_json) : null,
  };
}

export function updateVoiceProfile(profile: VoiceProfile) {
  const db = getDb();
  const profileJson = profile.profile_json || (profile.unified_profile ? JSON.stringify(profile.unified_profile) : null);
  db.prepare(`
    UPDATE voice_profiles
    SET name = ?,
        tone_descriptors = ?,
        sentence_cadence = ?,
        preferred_transitions = ?,
        rhetorical_habits = ?,
        synthesized_guidelines = ?,
        profile_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    profile.name,
    JSON.stringify(profile.tone_descriptors),
    JSON.stringify(profile.sentence_cadence),
    JSON.stringify(profile.preferred_transitions),
    JSON.stringify(profile.rhetorical_habits),
    profile.synthesized_guidelines,
    profileJson,
    profile.updated_at,
    profile.id
  );
}

// --- Learned Rules ---
export function getAllLearnedRules(): LearnedRule[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM learned_rules ORDER BY created_at DESC").all() as any[];
  return rows;
}

export function getActiveLearnedRules(): LearnedRule[] {
  const db = getDb();
  // Rules with insufficient evidence (observed_count < 2 or confidence < 60%) must not become active
  const rows = db
    .prepare(
      "SELECT * FROM learned_rules WHERE is_active = 1 AND observed_count >= 2 AND confidence_pct >= 60.0 ORDER BY confidence_pct DESC, accepted_count DESC"
    )
    .all() as any[];
  return rows;
}

export function addLearnedRule(
  rule: Omit<LearnedRule, "is_active" | "observed_count" | "accepted_count" | "rejected_count" | "confidence_pct"> & {
    is_active?: number;
    observed_count?: number;
    accepted_count?: number;
    rejected_count?: number;
    confidence_pct?: number;
  }
) {
  const db = getDb();
  const observed = rule.observed_count ?? 1;
  const accepted = rule.accepted_count ?? 1;
  const rejected = rule.rejected_count ?? 0;
  const total = observed > 0 ? observed : accepted + rejected;
  const conf = total > 0 ? Math.round((accepted / total) * 1000) / 10 : 100.0;
  // Rules with insufficient evidence (observed < 2) must not become active
  const isActive = rule.is_active !== undefined ? rule.is_active : (total >= 2 && conf >= 60.0 ? 1 : 0);

  db.prepare(`
    INSERT INTO learned_rules (
      id, rewrite_id, rule_text, category, before_snippet, after_snippet,
      is_active, observed_count, accepted_count, rejected_count, confidence_pct, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rule.id,
    rule.rewrite_id || null,
    rule.rule_text,
    rule.category,
    rule.before_snippet || null,
    rule.after_snippet || null,
    isActive,
    total,
    accepted,
    rejected,
    conf,
    rule.created_at
  );
}

export function recordRuleFeedback(ruleId: string, accepted: boolean): LearnedRule | null {
  const db = getDb();
  const rule = db.prepare("SELECT * FROM learned_rules WHERE id = ?").get(ruleId) as LearnedRule | undefined;
  if (!rule) return null;

  const observed = (rule.observed_count || 1) + 1;
  const acceptedCount = (rule.accepted_count || 1) + (accepted ? 1 : 0);
  const rejectedCount = (rule.rejected_count || 0) + (accepted ? 0 : 1);
  const confidence = Math.round((acceptedCount / observed) * 1000) / 10;
  const isActive = observed >= 2 && confidence >= 60.0 ? 1 : 0;

  db.prepare(`
    UPDATE learned_rules
    SET observed_count = ?,
        accepted_count = ?,
        rejected_count = ?,
        confidence_pct = ?,
        is_active = ?
    WHERE id = ?
  `).run(observed, acceptedCount, rejectedCount, confidence, isActive, ruleId);

  return {
    ...rule,
    observed_count: observed,
    accepted_count: acceptedCount,
    rejected_count: rejectedCount,
    confidence_pct: confidence,
    is_active: isActive,
  };
}

export function toggleLearnedRule(id: string, is_active: boolean) {
  const db = getDb();
  db.prepare("UPDATE learned_rules SET is_active = ? WHERE id = ?").run(is_active ? 1 : 0, id);
}

export function deleteLearnedRule(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM learned_rules WHERE id = ?").run(id);
}

// --- Rewrite History ---
export function addRewriteHistory(record: RewriteRecord) {
  const db = getDb();
  db.prepare(`
    INSERT INTO rewrite_history (
      id, title, section_type, draft_input, rewritten_output,
      user_final_text, fidelity_data, verbatim_check, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.title || null,
    record.section_type,
    record.draft_input,
    record.rewritten_output,
    record.user_final_text || null,
    JSON.stringify(record.fidelity_data),
    JSON.stringify(record.verbatim_check),
    record.created_at
  );
}

export function updateRewriteUserText(id: string, user_final_text: string) {
  const db = getDb();
  db.prepare("UPDATE rewrite_history SET user_final_text = ? WHERE id = ?").run(user_final_text, id);
}

export function getRecentRewrites(limit = 10): RewriteRecord[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM rewrite_history ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
  return rows.map((r) => ({
    ...r,
    fidelity_data: JSON.parse(r.fidelity_data || "{}"),
    verbatim_check: JSON.parse(r.verbatim_check || "{}"),
  }));
}
