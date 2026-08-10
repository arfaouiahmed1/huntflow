import { jobsRepo, interviewsRepo, memoryRepo } from "@/lib/db";
import { searchVault } from "@/lib/vault";

export async function executePipelineSummaryTool() {
  const jobs = jobsRepo.list();
  const interviews = interviewsRepo.list();
  const memories = memoryRepo.list({ limit: 5 });

  const byStatus = jobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const openCount = jobs.filter((j) => j.status === "applied" || j.status === "interviewing").length;
  const overdueFollowups = jobs.filter((j) => j.followUpDue && new Date(j.followUpDue) < new Date() && j.status !== "rejected" && j.status !== "offer").length;
  const upcomingInterviews = interviews.filter((i) => i.status === "scheduled" && new Date(i.scheduledAt) >= new Date()).length;

  return {
    success: true,
    totalTracked: jobs.length,
    byStatus,
    openCount,
    overdueFollowups,
    upcomingInterviews,
    memories: memories.map((m) => m.content),
  };
}

export async function executeSearchJobsTool(query: string) {
  const all = jobsRepo.list();
  const q = query.toLowerCase();
  const matched = all.filter(
    (j) =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      (j.jobDescription && j.jobDescription.toLowerCase().includes(q))
  );
  return {
    success: true,
    count: matched.length,
    jobs: matched.slice(0, 5).map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      status: j.status,
      matchScore: j.matchScore,
    })),
  };
}

export async function executeSearchVaultTool(query: string) {
  const hits = await searchVault(query, 3);
  return {
    success: true,
    count: hits.length,
    results: hits.map((h) => ({
      documentId: h.docId,
      filename: h.docName,
      score: h.score,
      excerpt: h.text.slice(0, 300),
    })),
  };
}

export async function executeRememberTool(content: string, jobId?: string) {
  const item = memoryRepo.add({
    kind: "insight",
    content,
    jobId: jobId || undefined,
    source: "assistant",
    importance: 3,
  });
  return {
    success: true,
    memoryId: item.id,
    content: item.content,
  };
}

export async function executeCrawlWebTool(category = "all", keyword = "developer") {
  const agentBase = process.env.SCRAPLING_AGENT_URL || "http://127.0.0.1:8001";
  try {
    const res = await fetch(`${agentBase}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, keyword, limit: 6 }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, count: data.jobs?.length || 0, jobs: data.jobs || [] };
    }
  } catch {
    /* fallback */
  }
  return { success: true, count: 0, jobs: [] };
}

