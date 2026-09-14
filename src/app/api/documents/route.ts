import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getAllDocuments, getPersonalDocuments, addDocument, updateVoiceProfile, getActiveVoiceProfile } from "@/lib/db/queries";
import { computeDocumentMetrics, synthesizeVoiceProfileFromDocs } from "@/lib/styleDNA/extract";
import { parseDocumentBuffer } from "@/lib/parser";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ensure local uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function GET() {
  try {
    const documents = getAllDocuments();
    return NextResponse.json({ success: true, documents });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let title = "";
    let rawText = "";
    let fileType = "txt";
    let localPath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const customTitle = formData.get("title") as string | null;

      if (!file) {
        return NextResponse.json({ success: false, error: "No file provided in form data." }, { status: 400 });
      }

      title = customTitle || file.name;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Store uploaded file locally on disk
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const localFilename = `${Date.now()}_${sanitizedName}`;
      const fullLocalPath = path.join(uploadsDir, localFilename);
      fs.writeFileSync(fullLocalPath, buffer);
      localPath = fullLocalPath;

      // Extract text using existing parser
      const parsed = await parseDocumentBuffer(buffer, file.name);
      rawText = parsed.text;
      fileType = parsed.fileType;
    } else {
      // JSON body for direct paste
      const body = await req.json();
      title = body.title || "Untitled Paper / Note";
      rawText = body.rawText || "";
      fileType = body.fileType || "paste";

      // Store direct paste locally as .txt
      const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      const localFilename = `${Date.now()}_${safeTitle}.txt`;
      const fullLocalPath = path.join(uploadsDir, localFilename);
      fs.writeFileSync(fullLocalPath, Buffer.from(rawText, "utf-8"));
      localPath = fullLocalPath;
    }

    if (!rawText || rawText.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "Document contains insufficient text (minimum 20 characters required)." },
        { status: 400 }
      );
    }

    const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;
    // Calculate comprehensive real metrics
    const metrics = computeDocumentMetrics(rawText);
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newDoc = {
      id: docId,
      title,
      file_type: fileType,
      raw_text: rawText,
      word_count: wordCount,
      local_path: localPath,
      metrics,
      created_at: new Date().toISOString(),
    };

    addDocument(newDoc);

    // Build ONE VoiceDNA profile from personal documents only
    const personalDocs = getPersonalDocuments();
    const allDocs = getAllDocuments();
    const updatedProfile = synthesizeVoiceProfileFromDocs(personalDocs.length > 0 ? personalDocs : allDocs);

    if (updatedProfile) {
      const db = getDb();
      const existing = db.prepare("SELECT id FROM voice_profiles WHERE is_active = 1 LIMIT 1").get() as any;
      if (existing) {
        updateVoiceProfile({ ...updatedProfile, id: existing.id });
      } else {
        db.prepare(`
          INSERT INTO voice_profiles (
            id, name, is_active, tone_descriptors, sentence_cadence,
            preferred_transitions, rhetorical_habits, synthesized_guidelines, profile_json, updated_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          updatedProfile.id,
          updatedProfile.name,
          JSON.stringify(updatedProfile.tone_descriptors),
          JSON.stringify(updatedProfile.sentence_cadence),
          JSON.stringify(updatedProfile.preferred_transitions),
          JSON.stringify(updatedProfile.rhetorical_habits),
          updatedProfile.synthesized_guidelines,
          updatedProfile.profile_json,
          updatedProfile.updated_at
        );
      }
    }

    const totalWords = allDocs.reduce((acc, d) => acc + d.word_count, 0);

    return NextResponse.json({
      success: true,
      status: "Voice Learned",
      message: `Voice Learned from ${allDocs.length} documents (${totalWords.toLocaleString()} words)`,
      document: newDoc,
      voiceProfile: updatedProfile,
      profileJson: updatedProfile?.unified_profile || JSON.parse(updatedProfile?.profile_json || "{}"),
    });
  } catch (err: any) {
    console.error("Document upload error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
