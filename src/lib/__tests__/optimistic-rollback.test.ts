import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider, useApp } from "@/context/AppContext";
import { ToasterProvider, useToast } from "@/components/ui/Toaster";
import { JobApplication, Contact, EmailMessage, InterviewEvent, Reminder, UserProfile, CloudinarySettings } from "@/types";

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

// Test harness to render AppContext and capture its live API
function renderAppContext() {
  let contextApi!: ReturnType<typeof useApp>;
  let toastApi!: ReturnType<typeof useToast>;

  function TestConsumer() {
    contextApi = useApp();
    toastApi = useToast();
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

describe("AppContext Optimistic Mutation Rollback & State Resilience", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("1. addApplication: adds optimistically, rolls back and dispatches error toast on HTTP 500", async () => {
    // Initial hydration mock
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data" || urlStr === "/api/data/stats") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [], contacts: [], emails: [], interviews: [], reminders: [] }), { status: 200 }));
      }
      if (urlStr === "/api/data/jobs" && opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Database disk full" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const initialCount = harness.api.applications.length;
    let addedJob!: JobApplication;

    await act(async () => {
      addedJob = harness.api.addApplication({
        title: "Frontend Architect",
        company: "Stripe",
        location: "Remote",
        status: "wishlist",
        salary: "$200,000",
        notes: "Test application",
        jobDescription: "Build payments UI",
      });
    });

    // Immediately after mutation, item is present optimistically
    expect(addedJob).toBeDefined();
    expect(addedJob.id).toMatch(/^job-/);

    // Wait for the async persistence rejection & rollback to take effect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // State should have rolled back: newly added application is removed
    expect(harness.api.applications.some((a) => a.id === addedJob.id)).toBe(false);
    expect(harness.api.applications.length).toBe(initialCount);

    harness.unmount();
  });

  it("2. updateApplication: updates optimistically, restores previous snapshot on HTTP 400 and suppresses sync", async () => {
    const existingJob: JobApplication = {
      id: "job-stripe-1",
      title: "Staff Engineer",
      company: "Stripe",
      location: "San Francisco",
      jobDescription: "",
      status: "wishlist",
      createdDate: "2026-08-01",
    };

    let syncCalled = false;

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [existingJob] }), { status: 200 }));
      }
      if (urlStr === "/api/mail/sync") {
        syncCalled = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      if (urlStr === "/api/data/jobs" && opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Validation failed: invalid status transition" }), { status: 400 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Optimistically update status to 'applied'
    await act(async () => {
      harness.api.updateApplication(existingJob.id, { status: "applied", salary: "$250k" });
    });

    // Wait for async persistence rejection & rollback
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const currentJob = harness.api.applications.find((a) => a.id === existingJob.id);
    expect(currentJob).toBeDefined();
    // Status must be reverted to 'wishlist'
    expect(currentJob?.status).toBe("wishlist");
    // syncInboxAfterApply must NOT have been called due to failure
    expect(syncCalled).toBe(false);

    harness.unmount();
  });

  it("3. deleteApplication: removes optimistically, restores to original index on Network Failure", async () => {
    const jobA: JobApplication = { id: "job-a", title: "Dev A", company: "Company A", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };
    const jobB: JobApplication = { id: "job-b", title: "Dev B", company: "Company B", location: "Remote", jobDescription: "", status: "applied", createdDate: "2026-08-02" };
    const jobC: JobApplication = { id: "job-c", title: "Dev C", company: "Company C", location: "Remote", jobDescription: "", status: "interviewing", createdDate: "2026-08-03" };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [jobA, jobB, jobC] }), { status: 200 }));
      }
      if (urlStr === "/api/data/jobs/job-b" && opts?.method === "DELETE") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(harness.api.applications.map((j) => j.id)).toEqual(["job-a", "job-b", "job-c"]);

    // Delete job-b
    await act(async () => {
      harness.api.deleteApplication("job-b");
    });

    // Wait for network failure rejection & rollback
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // job-b must be restored at index 1
    const finalIds = harness.api.applications.map((j) => j.id);
    expect(finalIds).toEqual(["job-a", "job-b", "job-c"]);

    harness.unmount();
  });

  it("4. Contacts CRUD: rolls back add, update, and delete mutations on failure", async () => {
    const existingContact: Contact = {
      id: "c-1",
      name: "Sarah Recruiter",
      role: "Lead Tech Recruiter",
      company: "Acme",
      email: "sarah@acme.com",
      phone: "",
      linkedin: "",
      source: "referral",
      relationship: "recruiter",
      notes: "",
      priority: "high",
      companyIds: [],
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ contacts: [existingContact] }), { status: 200 }));
      }
      if (urlStr.startsWith("/api/data/contacts")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "Contact service unavailable" }), { status: 503 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // 1. Add contact failure rollback
    let newContact!: Contact;
    await act(async () => {
      newContact = harness.api.addContact({
        name: "New Recruiter",
        company: "Google",
        email: "new@google.com",
        role: "Recruiter",
        phone: "",
        linkedin: "",
        source: "referral",
        relationship: "recruiter",
        notes: "",
        priority: "medium",
        companyIds: [],
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.contacts.some((c) => c.id === newContact.id)).toBe(false);

    // 2. Update contact failure rollback
    await act(async () => {
      harness.api.updateContact("c-1", { name: "Sarah Modified" });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.contacts.find((c) => c.id === "c-1")?.name).toBe("Sarah Recruiter");

    // 3. Delete contact failure rollback
    await act(async () => {
      harness.api.deleteContact("c-1");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.contacts.some((c) => c.id === "c-1")).toBe(true);

    harness.unmount();
  });

  it("5. Interviews & Reminders: rolls back schedule, toggle, and delete on failure", async () => {
    const existingReminder: Reminder = {
      id: "r-1",
      kind: "follow_up",
      note: "Follow up with Figma recruiter",
      done: false,
      dueAt: "2026-08-20T14:00:00Z",
      createdAt: "2026-08-01T00:00:00Z",
    };
    const existingInterview: InterviewEvent = {
      id: "i-1",
      title: "Technical Screen",
      type: "video",
      scheduledAt: "2026-08-20T14:00:00Z",
      durationMin: 60,
      location: "Remote",
      notes: "Screen",
      status: "scheduled",
      createdAt: "2026-08-01T00:00:00Z",
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ reminders: [existingReminder], interviews: [existingInterview] }), { status: 200 }));
      }
      if (urlStr.startsWith("/api/data/reminders") || urlStr.startsWith("/api/data/interviews")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "SQLite constraint violation" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Toggle reminder -> fails -> reverts done status back to false
    await act(async () => {
      harness.api.toggleReminder("r-1");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.reminders.find((r) => r.id === "r-1")?.done).toBe(false);

    // Delete interview -> fails -> restores interview in state
    await act(async () => {
      harness.api.deleteInterview("i-1");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.interviews.some((it) => it.id === "i-1")).toBe(true);

    harness.unmount();
  });

  it("6. Emails CRUD: rolls back email add, update, and delete on HTTP 500", async () => {
    const existingEmail: EmailMessage = {
      id: "e-1",
      direction: "sent",
      subject: "Thank you for the interview",
      body: "Appreciated speaking today.",
      sentAt: "2026-08-01T10:00:00Z",
      threadId: "th-1",
      status: "sent",
      read: true,
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ emails: [existingEmail] }), { status: 200 }));
      }
      if (urlStr.startsWith("/api/data/emails")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "Email storage error" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Add email -> fails -> removed from state
    let addedEmail!: EmailMessage;
    await act(async () => {
      addedEmail = harness.api.addEmail({
        direction: "sent",
        subject: "Follow up",
        body: "Checking in on status.",
        threadId: "th-2",
        status: "sent",
        read: true,
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.emails.some((e) => e.id === addedEmail.id)).toBe(false);

    // Update email -> fails -> reverts subject
    await act(async () => {
      harness.api.updateEmail("e-1", { subject: "Updated Subject" });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.emails.find((e) => e.id === "e-1")?.subject).toBe("Thank you for the interview");

    // Delete email -> fails -> restored
    await act(async () => {
      harness.api.deleteEmail("e-1");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(harness.api.emails.some((e) => e.id === "e-1")).toBe(true);

    harness.unmount();
  });

  it("7. Settings & Profile: rolls back saveCloudinarySettings, saveMailSettings, and updateProfile on failure", async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ settings: {} }), { status: 200 }));
      }
      if (urlStr === "/api/data/settings" && opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Settings persistence failed" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const initialProfile = { ...harness.api.profile };
    const modifiedProfile: UserProfile = {
      ...initialProfile,
      name: "New Profile Name",
      targetTitle: "Lead AI Engineer",
    };

    await act(async () => {
      harness.api.updateProfile(modifiedProfile);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Profile rolls back to initial
    expect(harness.api.profile.name).toBe(initialProfile.name);

    // Cloudinary settings rollback
    const newCloud: CloudinarySettings = {
      cloudName: "my-cloud",
      apiKey: "key-123",
      apiSecret: "secret-456",
      concurrency: 5,
    };

    await act(async () => {
      await harness.api.saveCloudinarySettings(newCloud);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(harness.api.cloudinarySettings.cloudName).toBe("");

    harness.unmount();
  });

  it("8. Concurrent Mutation Independence: failed mutation on Job A rolls back without affecting successful mutation on Job B", async () => {
    const jobA: JobApplication = { id: "job-1", title: "Job 1", company: "Company 1", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };
    const jobB: JobApplication = { id: "job-2", title: "Job 2", company: "Company 2", location: "Remote", jobDescription: "", status: "wishlist", createdDate: "2026-08-01" };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [jobA, jobB] }), { status: 200 }));
      }
      if (urlStr === "/api/data/jobs" && opts?.method === "POST") {
        const body = JSON.parse(String(opts.body));
        if (body.id === "job-1") {
          // Job A fails on server
          return Promise.resolve(new Response(JSON.stringify({ error: "Job A server error" }), { status: 500 }));
        }
        if (body.id === "job-2") {
          // Job B succeeds on server
          return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
        }
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Mutate both jobs concurrently
    await act(async () => {
      harness.api.updateApplication("job-1", { status: "interviewing" });
      harness.api.updateApplication("job-2", { status: "offer" });
    });

    // Wait for async persistence and rollback resolution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const finalJobA = harness.api.applications.find((a) => a.id === "job-1");
    const finalJobB = harness.api.applications.find((a) => a.id === "job-2");

    // Job A must roll back to 'wishlist'
    expect(finalJobA?.status).toBe("wishlist");
    // Job B must remain 'offer'
    expect(finalJobB?.status).toBe("offer");

    harness.unmount();
  });

  it("9. MailSettings & Providers: rolls back saveMailSettings and updateProviders on failure", async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ settings: {} }), { status: 200 }));
      }
      if (urlStr === "/api/data/settings" && opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Disk I/O error" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const initialProviders = [...harness.api.providers];

    // Attempt provider update
    await act(async () => {
      const updated = initialProviders.map((p) => (p.id === "openai" ? { ...p, enabled: false } : p));
      harness.api.updateProviders(updated);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Providers should be rolled back to initial state
    expect(harness.api.providers.find((p) => p.id === "openai")?.enabled).toBe(
      initialProviders.find((p) => p.id === "openai")?.enabled
    );

    // Attempt mail settings update
    await act(async () => {
      await harness.api.saveMailSettings({
        imapHost: "imap.example.com",
        imapPort: 993,
        imapUser: "mymail@example.com",
        imapPass: "secret",
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpUser: "mymail@example.com",
        smtpPass: "secret",
        fromName: "John Doe",
        fromEmail: "mymail@example.com",
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Mail settings should be rolled back
    expect(harness.api.mailSettings.fromEmail).toBe("");

    harness.unmount();
  });

  it("10. addReminder & updateInterview: adds and updates optimistically, rolls back cleanly on failure", async () => {
    const existingInterview: InterviewEvent = {
      id: "int-google-1",
      title: "System Design",
      type: "video",
      scheduledAt: "2026-09-01T10:00:00Z",
      durationMin: 60,
      location: "Remote",
      notes: "Onsite Round 1",
      status: "scheduled",
      createdAt: "2026-08-01T00:00:00Z",
    };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === "/api/data") {
        return Promise.resolve(new Response(JSON.stringify({ interviews: [existingInterview], reminders: [] }), { status: 200 }));
      }
      if (opts?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Transaction aborted" }), { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // 1. addReminder rollback
    let addedReminder!: Reminder;
    await act(async () => {
      addedReminder = harness.api.addReminder({
        kind: "custom",
        note: "Submit code challenge before Friday",
        dueAt: "2026-08-25",
        done: false,
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(harness.api.reminders.some((r) => r.id === addedReminder.id)).toBe(false);

    // 2. updateInterview rollback
    await act(async () => {
      harness.api.updateInterview("int-google-1", { notes: "Onsite Final" });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const currInterview = harness.api.interviews.find((i) => i.id === "int-google-1");
    expect(currInterview?.notes).toBe("Onsite Round 1");

    harness.unmount();
  });
});
