import mammoth from "mammoth";

export async function parseDocumentBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; fileType: string }> {
  const ext = filename.toLowerCase().split(".").pop() || "";

  if (ext === "pdf") {
    try {
      // pdf-parse v2/v1 support
      const pdfModule: any = await import("pdf-parse");
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        await parser.load();
        const textResult = await parser.getText();
        await parser.destroy();
        const text = typeof textResult === "string" ? textResult : (textResult?.text || JSON.stringify(textResult));
        return { text: text.trim(), fileType: "pdf" };
      } else if (typeof pdfModule.default === "function") {
        const data = await pdfModule.default(buffer);
        return { text: (data.text || "").trim(), fileType: "pdf" };
      } else if (typeof pdfModule === "function") {
        const data = await pdfModule(buffer);
        return { text: (data.text || "").trim(), fileType: "pdf" };
      } else {
        throw new Error("Unable to initialize PDFParse library.");
      }
    } catch (err: any) {
      throw new Error(`Failed to parse PDF document: ${err.message}`);
    }
  }

  if (ext === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value.trim(), fileType: "docx" };
    } catch (err: any) {
      throw new Error(`Failed to parse DOCX document: ${err.message}`);
    }
  }

  if (["txt", "md", "markdown", "tex"].includes(ext)) {
    return { text: buffer.toString("utf-8").trim(), fileType: ext };
  }

  // Fallback to utf-8 text
  return { text: buffer.toString("utf-8").trim(), fileType: ext || "txt" };
}
