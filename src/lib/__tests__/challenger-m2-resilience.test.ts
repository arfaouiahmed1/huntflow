import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider, useApp } from "@/context/AppContext";
import { ToasterProvider, useToast } from "@/components/ui/Toaster";
import {
  JobApplication,
  Contact,
  EmailMessage,
  InterviewEvent,
  Reminder,
  UserProfile,
  CloudinarySettings,
  MailSettings,
} from "@/types";

// Polyfill minimal browser DOM & localStorage if running under Node environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    length: 0,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    writable: true,
  });
}

class MockNode {
  nodeType = 1;
  nodeName = "DIV";
  tagName = "DIV";
  childNodes: MockNode[] = [];
  children: MockElement[] = [];
  ownerDocument: MockDocument | null = null;
  parentNode: MockNode | null = null;

  addEventListener() {}
  removeEventListener() {}

  appendChild<T extends MockNode>(child: T): T {
    this.childNodes.push(child);
    child.parentNode = this;
    if (child instanceof MockElement) {
      this.children.push(child);
    }
    return child;
  }

  removeChild<T extends MockNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
    }
    if (child instanceof MockElement) {
      const elIdx = this.children.indexOf(child);
      if (elIdx !== -1) {
        this.children.splice(elIdx, 1);
      }
    }
    child.parentNode = null;
    return child;
  }

  insertBefore<T extends MockNode>(newChild: T): T {
    this.childNodes.push(newChild);
    newChild.parentNode = this;
    if (newChild instanceof MockElement) {
      this.children.push(newChild);
    }
    return newChild;
  }
}

class MockElement extends MockNode {
  tagName = "DIV";
  nodeName = "DIV";
  style: Record<string, string> = {};
  setAttribute() {}
  removeAttribute() {}
  getAttribute() {
    return null;
  }
  getBoundingClientRect(): DOMRect {
    return {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }
}

class MockHTMLElement extends MockElement {}
class MockHTMLIFrameElement extends MockHTMLElement {}

interface MockDocument {
  nodeType: number;
  nodeName: string;
  documentElement: MockHTMLElement;
  body: MockHTMLElement;
  activeElement: MockHTMLElement | null;
  createElement: (tag: string) => MockHTMLElement;
  createElementNS: (_ns: string, tag: string) => MockHTMLElement;
  createDocumentFragment: () => MockNode;
  createTextNode: (text: string) => MockNode;
  createComment: (text: string) => MockNode;
  addEventListener: () => void;
  removeEventListener: () => void;
}

if (typeof document === "undefined" || !document.createElement) {
  const createMockNode = (tag = "div"): MockHTMLElement => {
    const node = new MockHTMLElement();
    node.tagName = tag.toUpperCase();
    node.nodeName = tag.toUpperCase();
    return node;
  };

  const docNode = createMockNode("html");
  const bodyNode = createMockNode("body");
  docNode.childNodes.push(bodyNode);
  docNode.children.push(bodyNode);

  const mockDoc: MockDocument = {
    nodeType: 9,
    nodeName: "#document",
    documentElement: docNode,
    body: bodyNode,
    activeElement: null,
    createElement: (tag: string) => {
      const el = createMockNode(tag);
      el.ownerDocument = mockDoc;
      return el;
    },
    createElementNS: (_ns: string, tag: string) => {
      const el = createMockNode(tag);
      el.ownerDocument = mockDoc;
      return el;
    },
    createDocumentFragment: () => {
      const el = new MockNode();
      el.nodeType = 11;
      el.ownerDocument = mockDoc;
      return el;
    },
    createTextNode: () => {
      const n = new MockNode();
      n.nodeType = 3;
      return n;
    },
    createComment: () => {
      const n = new MockNode();
      n.nodeType = 8;
      return n;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  Object.defineProperty(globalThis, "document", { value: mockDoc, writable: true });
  Object.defineProperty(globalThis, "window", { value: globalThis, writable: true });
  Object.defineProperty(globalThis, "Node", { value: MockNode, writable: true });
  Object.defineProperty(globalThis, "Element", { value: MockElement, writable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: MockHTMLElement, writable: true });
  Object.defineProperty(globalThis, "HTMLIFrameElement", { value: MockHTMLIFrameElement, writable: true });
  Object.defineProperty(globalThis, "location", {
    value: { reload: vi.fn(), search: "" },
    writable: true,
  });
  Object.defineProperty(globalThis, "history", {
    value: { replaceState: vi.fn() },
    writable: true,
  });
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
}

// Track toast invocations
const toastLogs: { kind: string; message: string; timestamp: number }[] = [];

// Render harness wrapping ToasterProvider and AppProvider
function renderAppContextWithToastSpy() {
  toastLogs.length = 0;
  let contextApi!: ReturnType<typeof useApp>;
  let toastApi!: ReturnType<typeof useToast>;
  let patched = false;

  function TestConsumer() {
    contextApi = useApp();
    toastApi = useToast();

    if (!patched && toastApi) {
      const origError = toastApi.error;
      toastApi.error = (msg: string) => {
        toastLogs.push({ kind: "error", message: msg, timestamp: Date.now() });
        origError(msg);
      };
      patched = true;
    }
    return null;
  }

  const container = document.createElement("div");
  const root = createRoot(container as unknown as HTMLElement);

  act(() => {
    root.render(
      React.createElement(
        ToasterProvider,
        null,
        React.createElement(
          AppProvider,
          null,
          React.createElement(TestConsumer, null)
        )
      )
    );
  });

  return {
    get api() {
      return contextApi;
    },
    get toast() {
      return toastApi;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("Empirical Challenger: AppContext State Resilience & Adversarial Stress Tests", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
    toastLogs.length = 0;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("Stress Test 1: Full HTTP Non-2xx Matrix (400, 404, 429, 500, 503) cleanly rolls back all domain models", async () => {
    const seedJob: JobApplication = { id: "job-matrix-1", title: "Original Title", company: "Matrix Corp", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };
    const seedContact: Contact = { id: "contact-matrix-1", name: "Original Contact", email: "orig@matrix.com", company: "Matrix Corp", role: "Recruiter", phone: "", linkedin: "", source: "referral", relationship: "recruiter", notes: "", priority: "high", companyIds: [], createdAt: "2026-08-01", updatedAt: "2026-08-01" };
    const seedEmail: EmailMessage = { id: "email-matrix-1", direction: "sent", subject: "Original Subject", body: "Original Body", sentAt: "2026-08-01", threadId: "th-1", status: "sent", read: true };
    const seedInterview: InterviewEvent = { id: "int-matrix-1", title: "Original Interview", type: "video", scheduledAt: "2026-08-25T10:00:00Z", durationMin: 60, location: "Remote", notes: "Screen", status: "scheduled", createdAt: "2026-08-01" };
    const seedReminder: Reminder = { id: "rem-matrix-1", kind: "follow_up", note: "Original Reminder", done: false, dueAt: "2026-08-25T10:00:00Z", createdAt: "2026-08-01" };

    const statusCodes = [400, 404, 429, 500, 503];

    for (const statusCode of statusCodes) {
      global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr === "/api/data") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jobs: [{ ...seedJob }],
                contacts: [{ ...seedContact }],
                emails: [{ ...seedEmail }],
                interviews: [{ ...seedInterview }],
                reminders: [{ ...seedReminder }],
                settings: {},
              }),
              { status: 200 }
            )
          );
        }
        if (urlStr === "/api/data/stats") {
          return Promise.resolve(new Response(JSON.stringify({ openPositions: 1 }), { status: 200 }));
        }
        // Fail any mutation with the test status code
        if (opts?.method === "POST" || opts?.method === "DELETE") {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: `Simulated HTTP ${statusCode} failure on ${urlStr}` }),
              { status: statusCode }
            )
          );
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      });

      const harness = renderAppContextWithToastSpy();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // 1. Update Job failure on statusCode
      await act(async () => {
        harness.api.updateApplication("job-matrix-1", { title: `Mutated Title ${statusCode}` });
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
      expect(harness.api.applications.find((j) => j.id === "job-matrix-1")?.title).toBe("Original Title");

      // 2. Update Contact failure on statusCode
      await act(async () => {
        harness.api.updateContact("contact-matrix-1", { name: `Mutated Contact ${statusCode}` });
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
      expect(harness.api.contacts.find((c) => c.id === "contact-matrix-1")?.name).toBe("Original Contact");

      // 3. Toggle Reminder failure on statusCode
      await act(async () => {
        harness.api.toggleReminder("rem-matrix-1");
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
      expect(harness.api.reminders.find((r) => r.id === "rem-matrix-1")?.done).toBe(false);

      // Verify that toast error notifications were fired
      expect(toastLogs.length).toBeGreaterThan(0);
      expect(toastLogs.some((l) => l.message.includes(String(statusCode)))).toBe(true);

      harness.unmount();
    }
  });

  it("Stress Test 2: Network Abort, Timeout, and TypeError Exceptions trigger graceful rollback", async () => {
    const jobA: JobApplication = { id: "job-net-1", title: "Network Test Job", company: "Offline Inc", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };

    const networkErrors = [
      new TypeError("Failed to fetch"),
      new DOMException("The user aborted a request.", "AbortError"),
      new Error("ECONNREFUSED 127.0.0.1:3000"),
    ];

    for (const netErr of networkErrors) {
      global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr === "/api/data") {
          return Promise.resolve(new Response(JSON.stringify({ jobs: [{ ...jobA }] }), { status: 200 }));
        }
        if (opts?.method === "POST") {
          return Promise.reject(netErr);
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      });

      const harness = renderAppContextWithToastSpy();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Optimistically update
      await act(async () => {
        harness.api.updateApplication("job-net-1", { status: "offer", salary: "$300k" });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });

      // Assert rollback to wishlist
      expect(harness.api.applications.find((j) => j.id === "job-net-1")?.status).toBe("wishlist");
      expect(harness.api.applications.find((j) => j.id === "job-net-1")?.salary).toBeUndefined();

      // Assert toast logged the network error message
      expect(toastLogs.some((l) => l.message.includes(netErr.message))).toBe(true);

      harness.unmount();
    }
  });

  it("Stress Test 3: Toast Notification Throttling (1500ms deduplication window)", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
      }
      if (opts?.method === "POST") {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Rapidly trigger 4 identical mutations in <100ms
    await act(async () => {
      harness.api.addApplication({ title: "Spam Job", company: "Spam Co", location: "Remote", jobDescription: "", status: "wishlist" });
      harness.api.addApplication({ title: "Spam Job", company: "Spam Co", location: "Remote", jobDescription: "", status: "wishlist" });
      harness.api.addApplication({ title: "Spam Job", company: "Spam Co", location: "Remote", jobDescription: "", status: "wishlist" });
      harness.api.addApplication({ title: "Spam Job", company: "Spam Co", location: "Remote", jobDescription: "", status: "wishlist" });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Four network calls were made
    expect(callCount).toBe(4);
    // But due to 1500ms throttling on identical message, only 1 toast should have been emitted
    const spamToasts = toastLogs.filter((t) => t.message.includes("Spam Job"));
    expect(spamToasts.length).toBe(1);

    harness.unmount();
  });

  it("Stress Test 4: Boundary & Exact Index Restoration on Deletion Rollback (head, middle, tail)", async () => {
    const list: JobApplication[] = Array.from({ length: 7 }, (_, i) => ({
      id: `job-index-${i}`,
      title: `Job ${i}`,
      company: `Company ${i}`,
      location: "Remote",
      jobDescription: "",
      status: "wishlist",
      createdDate: "2026-08-01",
    }));

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [...list] }), { status: 200 }));
      }
      if (opts?.method === "DELETE") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Cannot delete referenced entity" }), { status: 409 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(harness.api.applications.map((j) => j.id)).toEqual(list.map((j) => j.id));

    // Delete head (index 0)
    await act(async () => {
      harness.api.deleteApplication("job-index-0");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.applications.map((j) => j.id)).toEqual(list.map((j) => j.id));

    // Delete middle (index 3)
    await act(async () => {
      harness.api.deleteApplication("job-index-3");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.applications.map((j) => j.id)).toEqual(list.map((j) => j.id));

    // Delete tail (index 6)
    await act(async () => {
      harness.api.deleteApplication("job-index-6");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.applications.map((j) => j.id)).toEqual(list.map((j) => j.id));

    harness.unmount();
  });

  it("Stress Test 5: Deep Equality Preservation of Complex Nested Objects upon Rollback", async () => {
    const complexJob: JobApplication = {
      id: "job-complex-1",
      title: "Principal AI Architect",
      company: "Anthropic",
      location: "San Francisco, CA",
      jobDescription: "Lead architect for multi-agent LLM systems",
      status: "interviewing",
      salary: "$350,000 - $450,000",
      createdDate: "2026-08-01",
      documents: {
        tailoredResume: "Complex LaTeX resume with multi-page tabular layout",
        coverLetter: "Detailed cover letter citing 10 years distributed systems experience",
        motivationLetter: "Why AI safety matters",
        followUpEmail: "Thank you note to hiring VP",
      },
      matchScore: 95,
      fitCategory: "direct_fit",
      starFlashcards: [
        {
          id: "star-1",
          question: "How do you optimize inference latency?",
          situation: "High-latency inference pipeline",
          task: "Reduce p99 from 500ms to 50ms",
          action: "Implemented tensor parallel kernel fusing",
          result: "Reduced p99 to 38ms, saving $2M/yr",
          status: "mastered",
        },
      ],
      autoApplyStatus: "manual_required",
      autoApplyLogs: [{ timestamp: "2026-08-01T12:00:00Z", message: "Initial parse ok", type: "info" }],
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [JSON.parse(JSON.stringify(complexJob))] }), { status: 200 }));
      }
      if (opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Payload verification failed" }), { status: 422 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Mutate simple field
    await act(async () => {
      harness.api.updateApplication("job-complex-1", {
        status: "rejected",
        salary: "$0",
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const restoredJob = harness.api.applications.find((j) => j.id === "job-complex-1");
    expect(restoredJob).toBeDefined();
    // Verify all deeply nested fields survived intact
    expect(restoredJob?.status).toBe("interviewing");
    expect(restoredJob?.salary).toBe("$350,000 - $450,000");
    expect(restoredJob?.documents).toEqual(complexJob.documents);
    expect(restoredJob?.matchScore).toEqual(complexJob.matchScore);
    expect(restoredJob?.starFlashcards).toEqual(complexJob.starFlashcards);
    expect(restoredJob?.autoApplyLogs).toEqual(complexJob.autoApplyLogs);

    harness.unmount();
  });

  it("Stress Test 6: High-Concurrency Chaos (20 mixed mutations with 50% simulated server failure rate)", async () => {
    const initialJobs: JobApplication[] = Array.from({ length: 10 }, (_, i) => ({
      id: `chaos-job-${i}`,
      title: `Job ${i}`,
      company: `Company ${i}`,
      location: "Remote",
      jobDescription: "",
      status: "wishlist",
      createdDate: "2026-08-01",
    }));

    const initialContacts: Contact[] = Array.from({ length: 10 }, (_, i) => ({
      id: `chaos-contact-${i}`,
      name: `Contact ${i}`,
      company: `Company ${i}`,
      email: `contact${i}@test.com`,
      role: "Developer",
      phone: "",
      linkedin: "",
      source: "referral",
      relationship: "recruiter",
      notes: "",
      priority: "medium",
      companyIds: [],
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    }));

    // Server logic: even numbered IDs succeed, odd numbered IDs fail
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jobs: initialJobs.map((j) => ({ ...j })),
              contacts: initialContacts.map((c) => ({ ...c })),
            }),
            { status: 200 }
          )
        );
      }
      if (urlStr === "/api/data/stats") {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }
      if (opts?.method === "POST") {
        const body = JSON.parse(String(opts.body));
        const id = body.id || "";
        const numMatch = id.match(/\d+$/);
        const index = numMatch ? parseInt(numMatch[0], 10) : 0;
        if (index % 2 === 1) {
          // Odd fails
          return Promise.resolve(new Response(JSON.stringify({ error: `Odd ID ${id} rejected` }), { status: 500 }));
        }
        // Even succeeds
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Concurrently fire 10 job updates and 10 contact updates
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        harness.api.updateApplication(`chaos-job-${i}`, { status: "offer", notes: `Mutated note ${i}` });
        harness.api.updateContact(`chaos-contact-${i}`, { name: `Mutated Contact ${i}` });
      }
    });

    // Wait for all 20 promises and rollbacks to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Verify all 10 jobs: even ones kept changes, odd ones rolled back
    for (let i = 0; i < 10; i++) {
      const job = harness.api.applications.find((j) => j.id === `chaos-job-${i}`);
      if (i % 2 === 0) {
        expect(job?.status).toBe("offer");
        expect(job?.notes).toBe(`Mutated note ${i}`);
      } else {
        expect(job?.status).toBe("wishlist");
        expect(job?.notes).toBeUndefined();
      }
    }

    // Verify all 10 contacts: even ones kept changes, odd ones rolled back
    for (let i = 0; i < 10; i++) {
      const contact = harness.api.contacts.find((c) => c.id === `chaos-contact-${i}`);
      if (i % 2 === 0) {
        expect(contact?.name).toBe(`Mutated Contact ${i}`);
      } else {
        expect(contact?.name).toBe(`Contact ${i}`);
      }
    }

    harness.unmount();
  });

  it("Stress Test 7: Stats Refresh is invoked across all state mutations and rollback cycles", async () => {
    let statsFetchCount = 0;

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [], contacts: [], reminders: [] }), { status: 200 }));
      }
      if (urlStr === "/api/data/stats") {
        statsFetchCount++;
        return Promise.resolve(new Response(JSON.stringify({ openPositions: statsFetchCount }), { status: 200 }));
      }
      if (opts?.method === "POST" || opts?.method === "DELETE") {
        // Fails to trigger rollback
        return Promise.resolve(new Response(JSON.stringify({ error: "Failed" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const initialStatsFetches = statsFetchCount;

    // Trigger addApplication -> fails -> rolls back
    await act(async () => {
      harness.api.addApplication({ title: "Stats Job", company: "Stats Inc", location: "Remote", jobDescription: "", status: "wishlist" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Both initial mutation and rollback must call refreshStats()
    expect(statsFetchCount).toBeGreaterThan(initialStatsFetches);

    harness.unmount();
  });

  it("Stress Test 8: Multiple Settings & Profile Fields Rollback Integrity", async () => {
    const baseProfile: UserProfile = {
      name: "Challenger User",
      email: "user@challenger.io",
      phone: "555-0199",
      location: "Remote",
      targetTitle: "Director of Engineering",
      summary: "Engineering leader",
      skills: ["Go", "Kubernetes", "Architecture"],
      experience: [],
      education: [],
    };

    const baseMail: MailSettings = {
      imapHost: "imap.mail.com",
      imapPort: 993,
      imapUser: "u@mail.com",
      imapPass: "p",
      smtpHost: "smtp.mail.com",
      smtpPort: 587,
      smtpUser: "u@mail.com",
      smtpPass: "p",
      fromName: "Challenger",
      fromEmail: "u@mail.com",
    };

    const baseCloud: CloudinarySettings = {
      cloudName: "orig-cloud",
      apiKey: "orig-key",
      apiSecret: "orig-secret",
      concurrency: 2,
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              settings: {
                profile: JSON.stringify(baseProfile),
                mail_settings: JSON.stringify(baseMail),
                cloudinary_settings: JSON.stringify(baseCloud),
              },
            }),
            { status: 200 }
          )
        );
      }
      if (urlStr === "/api/data/settings" && opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Settings table locked" }), { status: 503 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // 1. Profile update failure
    await act(async () => {
      harness.api.updateProfile({ ...baseProfile, name: "Mutated Name", skills: ["Haskell"] });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.profile.name).toBe("Challenger User");
    expect(harness.api.profile.skills).toEqual(["Go", "Kubernetes", "Architecture"]);

    // 2. Mail settings update failure
    await act(async () => {
      harness.api.saveMailSettings({ ...baseMail, fromName: "Mutated Mail Sender" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.mailSettings.fromName).toBe("Challenger");

    // 3. Cloudinary settings update failure
    await act(async () => {
      await harness.api.saveCloudinarySettings({ ...baseCloud, cloudName: "mutated-cloud" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.cloudinarySettings.cloudName).toBe("orig-cloud");

    harness.unmount();
  });

  it("Stress Test 9: Non-JSON Server Responses (HTML error pages, empty responses, malformed JSON) handled gracefully", async () => {
    const jobA: JobApplication = { id: "job-html-1", title: "HTML Test Job", company: "Proxy Inc", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };

    const nonJsonResponses = [
      { body: "<html><body>502 Bad Gateway</body></html>", status: 502, expectedError: "Server returned status 502" },
      { body: "", status: 500, expectedError: "Server returned status 500" },
      { body: "{ malformed json...", status: 500, expectedError: "Server returned status 500" },
    ];

    for (const testCase of nonJsonResponses) {
      global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr === "/api/data") {
          return Promise.resolve(new Response(JSON.stringify({ jobs: [{ ...jobA }] }), { status: 200 }));
        }
        if (opts?.method === "POST") {
          return Promise.resolve(
            new Response(testCase.body, {
              status: testCase.status,
              headers: { "Content-Type": "text/html" },
            })
          );
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      });

      const harness = renderAppContextWithToastSpy();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      await act(async () => {
        harness.api.updateApplication("job-html-1", { status: "interviewing" });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Must roll back to wishlist
      expect(harness.api.applications.find((j) => j.id === "job-html-1")?.status).toBe("wishlist");

      // Toast must contain fallback status message
      expect(toastLogs.some((l) => l.message.includes(testCase.expectedError))).toBe(true);

      harness.unmount();
    }
  });

  it("Stress Test 10: Interleaved Deletion and Addition under Network Failure", async () => {
    const initialJobs: JobApplication[] = [
      { id: "job-del-1", title: "Existing Job 1", company: "Company 1", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" },
      { id: "job-del-2", title: "Existing Job 2", company: "Company 2", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" },
    ];

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [...initialJobs] }), { status: 200 }));
      }
      if (urlStr === "/api/data/jobs/job-del-1" && opts?.method === "DELETE") {
        // DELETE fails
        return Promise.resolve(new Response(JSON.stringify({ error: "Failed to delete" }), { status: 500 }));
      }
      if (urlStr === "/api/data/jobs" && opts?.method === "POST") {
        // POST succeeds
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    let newJob!: JobApplication;
    await act(async () => {
      // 1. Delete job-del-1 (will fail)
      harness.api.deleteApplication("job-del-1");
      // 2. Add brand new job (will succeed)
      newJob = harness.api.addApplication({ title: "New Job 3", company: "Company 3", location: "Remote", jobDescription: "", status: "applied" });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Both job-del-1 (restored) and newJob (added) should exist
    const currentIds = harness.api.applications.map((j) => j.id);
    expect(currentIds).toContain("job-del-1");
    expect(currentIds).toContain(newJob.id);
    expect(currentIds).toContain("job-del-2");

    harness.unmount();
  });

  it("Stress Test 11: LocalStorage mirrors optimistic updates and reconciles after rollback", async () => {
    const jobA: JobApplication = { id: "job-ls-1", title: "LocalStorage Job", company: "Local Co", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [{ ...jobA }] }), { status: 200 }));
      }
      if (opts?.method === "POST") {
        // Add 30ms network latency before rejecting
        return new Promise((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify({ error: "Save error" }), { status: 500 })), 30)
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Mutate optimistically
    await act(async () => {
      harness.api.updateApplication("job-ls-1", { status: "offer" });
      await new Promise((r) => setTimeout(r, 5));
    });

    // LocalStorage should reflect optimistic update immediately during in-flight window
    const lsDuring = JSON.parse(localStorage.getItem("job_finder_apps") || "[]") as JobApplication[];
    expect(lsDuring.find((j) => j.id === "job-ls-1")?.status).toBe("offer");

    // Wait for network failure & rollback
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // LocalStorage should reflect rolled back state
    const lsAfter = JSON.parse(localStorage.getItem("job_finder_apps") || "[]") as JobApplication[];
    expect(lsAfter.find((j) => j.id === "job-ls-1")?.status).toBe("wishlist");

    harness.unmount();
  });

  it("Stress Test 12: Rapid Status Cycles on Single Entity with Eventual Consistency", async () => {
    const targetJob: JobApplication = {
      id: "job-cycle-1",
      title: "Cycle Engineer",
      company: "Cycle Co",
      location: "Remote",
      jobDescription: "",
      status: "wishlist",
      createdDate: "2026-08-01",
    };

    let postCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [{ ...targetJob }] }), { status: 200 }));
      }
      if (opts?.method === "POST") {
        postCount++;
        // Fast failure for first 2 requests, 3rd succeeds
        if (postCount <= 2) {
          return Promise.resolve(new Response(JSON.stringify({ error: `Request ${postCount} failed` }), { status: 500 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContextWithToastSpy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Step 1: fails
    await act(async () => {
      harness.api.updateApplication("job-cycle-1", { status: "applied" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.applications.find((j) => j.id === "job-cycle-1")?.status).toBe("wishlist");

    // Step 2: fails
    await act(async () => {
      harness.api.updateApplication("job-cycle-1", { status: "interviewing" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.applications.find((j) => j.id === "job-cycle-1")?.status).toBe("wishlist");

    // Step 3: succeeds
    await act(async () => {
      harness.api.updateApplication("job-cycle-1", { status: "offer" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(harness.api.applications.find((j) => j.id === "job-cycle-1")?.status).toBe("offer");

    harness.unmount();
  });
});
