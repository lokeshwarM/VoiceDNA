import { NextRequest, NextResponse } from "next/server";
import { getAllDocuments, addDocument } from "@/lib/db/queries";
import { computeTextMetrics, synthesizeVoiceProfile } from "@/lib/ai/style-extractor";
import { parseDocumentBuffer } from "@/lib/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

      const parsed = await parseDocumentBuffer(buffer, file.name);
      rawText = parsed.text;
      fileType = parsed.fileType;
    } else {
      // JSON body for direct paste
      const body = await req.json();
      title = body.title || "Untitled Paper / Note";
      rawText = body.rawText || "";
      fileType = body.fileType || "paste";
    }

    if (!rawText || rawText.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "Document contains insufficient text (minimum 20 characters required)." },
        { status: 400 }
      );
    }

    const wordCount = rawText.trim().split(/\s+/).length;
    const metrics = computeTextMetrics(rawText);
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newDoc = {
      id: docId,
      title,
      file_type: fileType,
      raw_text: rawText,
      word_count: wordCount,
      metrics,
      created_at: new Date().toISOString(),
    };

    addDocument(newDoc);

    // Recalibrate Voice DNA profile across all documents
    const allDocs = getAllDocuments();
    const updatedProfile = await synthesizeVoiceProfile(allDocs);

    return NextResponse.json({
      success: true,
      document: newDoc,
      voiceProfile: updatedProfile,
    });
  } catch (err: any) {
    console.error("Document upload error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
