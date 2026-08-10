const ATS_MARKERS = [
  "greenhouse",
  "lever",
  "workday",
  "smartrecruiters",
  "ashbyhq",
  "welcomekit",
  "teamtailor",
  "talent-soft",
  "linkedin",
  "wttj",
  "bamboohr",
  "zohorecruit",
  "comeet",
];

export function companyDomain(company: string, url?: string): string {
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host.includes(".") && !ATS_MARKERS.some((m) => host.includes(m))) return host;
    } catch {
      /* fall through to name-based guess */
    }
  }
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(ltd|gmbh|sas|llc|inc|sa|srls?|spa)$/g, "");
  return slug ? `${slug}.com` : "";
}

export function companyLogoUrl(company: string, url?: string): string {
  const domain = companyDomain(company, url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
