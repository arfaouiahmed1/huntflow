type JobIdentity = { title?: string; company?: string };

export function displayJobTitle(job: JobIdentity): string {
  const title = String(job.title || "Unknown role")
    .replace(/\s+/g, " ")
    .trim();
  const company = displayJobCompany(job);
  const escapedCompany = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (
    title
      .replace(/^https?:\/\/\S+\s*(?:—|–|-|:)\s*/i, "")
      .replace(/^www\.\S+\s*(?:—|–|-|:)\s*/i, "")
      .replace(new RegExp(`^${escapedCompany}\\s*(?:—|–|-|:)\\s*`, "i"), "")
      .trim() || "Unknown role"
  );
}

export function displayJobCompany(job: JobIdentity): string {
  const company = String(job.company || "").replace(/\s+/g, " ").trim();
  if (!company) return "Unknown company";
  if (/^https?:\/\//i.test(company)) {
    try {
      return new URL(company).hostname.replace(/^www\./i, "");
    } catch {
      return company.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    }
  }
  return company;
}
