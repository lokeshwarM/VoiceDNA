import { NextRequest, NextResponse } from "next/server";
import { executeRewrite } from "@/lib/ai/rewrite-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftInput, sectionType, customInstructions, title, mode } = body;

    if (!draftInput || !draftInput.trim()) {
      return NextResponse.json(
        { success: false, error: "Draft input text is required." },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (obj: any) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          } catch (e) {
            console.warn("Error enqueuing rewrite event:", e);
          }
        };

        try {
          const result = await executeRewrite({
            draftInput,
            sectionType: sectionType || "General Academic",
            customInstructions,
            title,
            mode: mode || "preserve",
            onToken: (token: string) => {
              sendEvent({ type: "token", token });
            },
          });

          sendEvent({ type: "done", result });
          controller.close();
        } catch (err: any) {
          console.error("Rewrite generation error:", err);
          sendEvent({
            type: "error",
            error: err.message || "Failed to generate academic rewrite.",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("Rewrite route error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process rewrite request." },
      { status: 500 }
    );
  }
}
