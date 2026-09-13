import { NextRequest, NextResponse } from "next/server";
import { executeRewrite } from "@/lib/ai/rewrite-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftInput, sectionType, customInstructions, title } = body;

    if (!draftInput || !draftInput.trim()) {
      return NextResponse.json(
        { success: false, error: "Draft input text is required." },
        { status: 400 }
      );
    }

    const result = await executeRewrite({
      draftInput,
      sectionType: sectionType || "General Academic",
      customInstructions,
      title,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("Rewrite error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate rewrite." },
      { status: 500 }
    );
  }
}
