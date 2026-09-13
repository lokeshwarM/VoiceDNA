import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getAllDocuments, addDocument } from "@/lib/db/queries";
import { computeTextMetrics, synthesizeVoiceProfile } from "@/lib/ai/style-extractor";
import { parseDocumentBuffer } from "@/lib/parser";

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
    // Calculate comprehensive 6-dimension metrics
    const metrics = computeTextMetrics(rawText);
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

    // Build ONE VoiceDNA profile from ALL uploaded documents
    const allDocs = getAllDocuments();
    const updatedProfile = await synthesizeVoiceProfile(allDocs);

    return NextResponse.json({
      success: true,
      status: "Voice Learned",
      message: `Voice Learned from ${allDocs.length} documents (${allDocs.reduce((acc, d) => acc + d.word_count, 0).toLocaleString()} words)`,
      document: newDoc,
      voiceProfile: updatedProfile,
      profileJson: updatedProfile.unified_profile || JSON.parse(updatedProfile.profile_json || "{}"),
    });
  } catch (err: any) {
    console.error("Document upload error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
