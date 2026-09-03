"use client";

import { useState } from "react";
import { Check, Copy, Scale, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { ContractScanReport, scanEmploymentContract } from "@/lib/agents/contractScanner";
import { cn } from "@/lib/utils";

interface ContractReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  roleTitle?: string;
  companyName?: string;
}

export default function ContractReviewModal({
  isOpen,
  onClose,
  roleTitle = "Software Engineer",
  companyName = "Company",
}: ContractReviewModalProps) {
  const { success } = useToast();
  const [contractText, setContractText] = useState("");
  const [report, setReport] = useState<ContractScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleScan = () => {
    if (!contractText.trim()) return;
    setScanning(true);
    setTimeout(() => {
      const res = scanEmploymentContract(contractText);
      setReport(res);
      setScanning(false);
    }, 400);
  };

  const copyScript = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    success("Counter-offer script copied!");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl border border-[var(--line)] bg-[var(--ink-card)] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-[var(--paper)]">
                Offer Letter &amp; Contract Gotcha Scanner
              </h3>
              <p className="text-xs text-dim">
                Audits IP ownership breadth, non-competes, PTE windows, and clawback clauses for {roleTitle} at {companyName}.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:bg-white/5 hover:text-[var(--paper)] cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!report ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--paper)]">
                Paste Offer Letter or Employment Agreement Text:
              </span>
              <textarea
                rows={10}
                value={contractText}
                onChange={(e) => setContractText(e.target.value)}
                placeholder="Paste the contract text or sections covering IP Assignment, Non-Compete, Bonus, or Equity clauses..."
                className="w-full resize-y rounded-xl border border-line bg-white/[0.03] p-4 text-xs leading-relaxed text-paper outline-none placeholder:text-dim/70 focus:border-chartreuse/50 font-mono"
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleScan} disabled={!contractText.trim() || scanning} loading={scanning}>
                <Sparkles className="h-4 w-4" /> Scan for Gotchas
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-dim">Audit Result</p>
                <p className="mt-1 text-xs text-[var(--paper)] font-semibold">{report.summary}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider",
                  report.riskLevel === "critical"
                    ? "border border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]"
                    : report.riskLevel === "high"
                      ? "border border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]"
                      : "border border-[var(--chartreuse)]/40 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                )}
              >
                Risk: {report.riskLevel} (Score: {report.overallRiskScore}/100)
              </span>
            </div>

            {/* Findings List */}
            <div className="space-y-4">
              <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-dim">Flagged Clauses &amp; Remedies</h4>
              {report.findings.length === 0 ? (
                <p className="rounded-xl border border-[var(--chartreuse)]/25 bg-[var(--chartreuse)]/[0.04] p-4 text-xs text-[var(--chartreuse)] font-semibold">
                  No restrictive or overbroad clauses detected.
                </p>
              ) : (
                report.findings.map((f) => (
                  <div key={f.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-[var(--paper)]">{f.title}</span>
                      <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--coral)]">
                        {f.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    <p className="rounded-lg bg-black/40 p-2.5 font-mono text-[11px] text-dim italic">&ldquo;{f.extractedSnippet}&rdquo;</p>
                    <p className="text-xs text-dim leading-relaxed">{f.explanation}</p>
                    <div className="rounded-xl border border-[var(--chartreuse)]/20 bg-[var(--chartreuse)]/[0.04] p-3 text-xs leading-relaxed">
                      <p className="font-mono text-[10px] font-bold uppercase text-[var(--chartreuse)]">Suggested Counter-Language</p>
                      <p className="mt-1 text-[var(--paper)]">{f.suggestedCounterClause}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Counter-Offer Negotiation Scripts */}
            <div className="space-y-3 border-t border-[var(--line)] pt-4">
              <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-dim">Copy-Ready Negotiation Scripts</h4>
              {Object.entries(report.counterOfferScripts).map(([key, script]) => {
                if (!script) return null;
                const copied = copiedKey === key;
                return (
                  <div key={key} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-3.5 text-xs">
                    <p className="text-dim leading-relaxed italic">&ldquo;{script}&rdquo;</p>
                    <button
                      type="button"
                      onClick={() => copyScript(script, key)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-dim hover:text-[var(--paper)] cursor-pointer"
                    >
                      {copied ? <Check className="h-3 w-3 text-[var(--chartreuse)]" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setReport(null)}>Scan Another Contract</Button>
              <Button onClick={onClose} size="sm">Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
