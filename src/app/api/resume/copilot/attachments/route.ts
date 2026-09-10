import { NextRequest } from "next/server";
import { jsonError, routeError } from "@/lib/errors";
import { extractText, normalizeText } from "@/lib/vault/extract";
import { storeAttachment } from "@/lib/copilot/attachments";

/**
 * Secure Copilot attachments (PDF/images for the current turn only).
 *
 * Validation, in order: file count, per-file size, total size, MIME +
 * extension allowlist, magic bytes, PDF encryption probe. Failures are
 * 400/413/415/422 with actionable codes — never a silent accept.
 *
 * The response carries descriptors only (id, name, kind, size, chars).
 * Raw bytes and extracted text stay server-side in the ephemeral
 * attachment store; the streaming turn consumes them by id.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_PDF_CHARS = 12_000;

const ALLOWED: { mime: string; exts: string[]; kind: "pdf" | "image" }[] = [
  { mime: "application/pdf", exts: [".pdf"], kind: "pdf" },
  { mime: "image/png", exts: [".png"], kind: "image" },
  { mime: "image/jpeg", exts: [".jpg", ".jpeg"], kind: "image" },
  { mime: "image/webp", exts: [".webp"], kind: "image" },
];

function sniffKind(buffer: Buffer): "pdf" | "png" | "jpeg" | "webp" | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function looksEncryptedPdf(buffer: Buffer): boolean {
  // Encryption dictionaries sit near the trailer; scanning the whole
  // file is wasteful, the head + tail covers real-world PDFs.
  const head = buffer.subarray(0, 1_048_576).toString("latin1");
  const tail = buffer.length > 1_048_576 ? buffer.subarray(buffer.length - 1_048_576).toString("latin1") : "";
  return head.includes("/Encrypt") || tail.includes("/Encrypt");
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return jsonError("files field is required (multipart).", 400, "BAD_BODY");
    if (files.length > MAX_FILES) {
      return jsonError(`At most ${MAX_FILES} files per message.`, 413, "TOO_MANY_FILES");
    }

    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_TOTAL_BYTES) return jsonError("Attachments exceed 25 MB total.", 413, "TOO_LARGE");

    const out: { id: string; name: string; kind: string; mime: string; size: number; chars?: number; truncated?: boolean }[] = [];
    for (const file of files) {
      if (file.size === 0) return jsonError(`"${file.name}" is empty.`, 400, "EMPTY_FILE");
      if (file.size > MAX_FILE_BYTES) {
        return jsonError(`"${file.name}" exceeds 10 MB per file.`, 413, "FILE_TOO_LARGE");
      }
      const lower = file.name.toLowerCase();
      const rule = ALLOWED.find((a) => a.mime === file.type && a.exts.some((e) => lower.endsWith(e)));
      if (!rule) {
        return jsonError(
          `"${file.name}" must be PDF, PNG, JPEG, or WebP (matching extension and type).`,
          415,
          "UNSUPPORTED_TYPE"
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const sniffed = sniffKind(buffer);
      const sniffOk =
        (rule.kind === "pdf" && sniffed === "pdf") ||
        (rule.mime === "image/png" && sniffed === "png") ||
        (rule.mime === "image/jpeg" && sniffed === "jpeg") ||
        (rule.mime === "image/webp" && sniffed === "webp");
      if (!sniffOk) {
        return jsonError(`"${file.name}" content does not match its ${rule.mime} label.`, 415, "TYPE_MISMATCH");
      }

      if (rule.kind === "pdf") {
        if (looksEncryptedPdf(buffer)) {
          return jsonError(`"${file.name}" is encrypted — remove the password and reattach.`, 422, "ENCRYPTED_PDF");
        }
        let text = "";
        try {
          text = normalizeText(await extractText(buffer, file.type, file.name));
        } catch (e: unknown) {
          return jsonError(
            `Could not read "${file.name}": ${e instanceof Error ? e.message : String(e)}`,
            422,
            "UNREADABLE_PDF"
          );
        }
        if (!text) return jsonError(`"${file.name}" contains no readable text.`, 422, "UNREADABLE_PDF");
        const truncated = text.length > MAX_PDF_CHARS;
        const id = storeAttachment({
          name: file.name.slice(0, 120),
          mime: file.type,
          size: file.size,
          kind: "pdf",
          text: truncated ? text.slice(0, MAX_PDF_CHARS) : text,
          truncated,
        });
        out.push({ id, name: file.name.slice(0, 120), kind: "pdf", mime: file.type, size: file.size, chars: text.length, truncated });
      } else {
        const id = storeAttachment({
          name: file.name.slice(0, 120),
          mime: file.type,
          size: file.size,
          kind: "image",
          base64: buffer.toString("base64"),
        });
        out.push({ id, name: file.name.slice(0, 120), kind: "image", mime: file.type, size: file.size });
      }
    }
    return Response.json({ ok: true, attachments: out });
  } catch (err) {
    return routeError(err);
  }
}
