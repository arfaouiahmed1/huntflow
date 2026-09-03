"use client";

export type PersistKind = "info" | "success" | "warning" | "error" | "review";

export async function persistNotification(input: {
  title: string;
  message: string;
  kind?: PersistKind;
  link?: string;
}): Promise<void> {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        message: input.message,
        kind: input.kind ?? "info",
        link: input.link,
      }),
    });
  } catch {
    // fire-and-forget — toast already surfaced the result; notification persistence is best-effort
  }
}
