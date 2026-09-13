import { NextRequest, NextResponse } from "next/server";
import { scanAndSyncCorpus } from "@/lib/styleDNA/corpus";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await scanAndSyncCorpus();
    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err: any) {
    console.error("Error scanning corpus:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const corpusDir = path.join(process.cwd(), "data", "corpus");
    if (!fs.existsSync(corpusDir)) {
      fs.mkdirSync(corpusDir, { recursive: true });
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Safe filename that never overwrites existing files
      let fileName = file.name;
      let targetPath = path.join(corpusDir, fileName);
      if (fs.existsSync(targetPath)) {
        const parsed = path.parse(fileName);
        fileName = `${parsed.name}_${Date.now()}${parsed.ext}`;
        targetPath = path.join(corpusDir, fileName);
      }

      fs.writeFileSync(targetPath, buffer);
    } else {
      const body = await req.json();
      const { title, content } = body;
      if (!content || !content.trim()) {
        return NextResponse.json({ success: false, error: "Content cannot be empty" }, { status: 400 });
      }

      const baseName = (title || "notes").replace(/[^a-zA-Z0-9_-]/g, "_");
      let fileName = `${baseName}.txt`;
      let targetPath = path.join(corpusDir, fileName);
      if (fs.existsSync(targetPath)) {
        fileName = `${baseName}_${Date.now()}.txt`;
        targetPath = path.join(corpusDir, fileName);
      }

      fs.writeFileSync(targetPath, content.trim(), "utf-8");
    }

    const summary = await scanAndSyncCorpus();
    return NextResponse.json({
      success: true,
      ...summary,
      message: "File successfully added to corpus and processed.",
    });
  } catch (err: any) {
    console.error("Error uploading to corpus:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
