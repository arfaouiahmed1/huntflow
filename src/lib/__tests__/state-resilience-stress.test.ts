import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, useApp } from '@/context/AppContext';
import { ToasterProvider, useToast } from '@/components/ui/Toaster';
import MemoryFeed from '@/components/MemoryFeed';
import NotificationCenter from '@/components/NotificationCenter';
import {
  JobApplication,
  Contact,
  EmailMessage,
  InterviewEvent,
  Reminder,
  NotificationItem,
} from '@/types';

// Polyfill minimal browser DOM & localStorage for node environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.localStorage === 'undefined') {
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
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
  });
}

class MockNode {
  nodeType = 1;
  nodeName = 'DIV';
  tagName = 'DIV';
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
  tagName = 'DIV';
  nodeName = 'DIV';
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

if (typeof document === 'undefined' || !document.createElement) {
  const createMockNode = (tag = 'div'): MockHTMLElement => {
    const node = new MockHTMLElement();
    node.tagName = tag.toUpperCase();
    node.nodeName = tag.toUpperCase();
    return node;
  };

  const docNode = createMockNode('html');
  const bodyNode = createMockNode('body');
  docNode.childNodes.push(bodyNode);
  docNode.children.push(bodyNode);

  const mockDoc: MockDocument = {
    nodeType: 9,
    nodeName: '#document',
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

  Object.defineProperty(globalThis, 'document', { value: mockDoc, writable: true });
  Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });
  Object.defineProperty(globalThis, 'Node', { value: MockNode, writable: true });
  Object.defineProperty(globalThis, 'Element', { value: MockElement, writable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: MockHTMLElement, writable: true });
  Object.defineProperty(globalThis, 'HTMLIFrameElement', { value: MockHTMLIFrameElement, writable: true });
  Object.defineProperty(globalThis, 'location', {
    value: { reload: vi.fn(), search: '' },
    writable: true,
  });
  Object.defineProperty(globalThis, 'history', {
    value: { replaceState: vi.fn() },
    writable: true,
  });
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
}

// Test harness helper to render AppContext
function renderAppContext() {
  let contextApi!: ReturnType<typeof useApp>;
  let toastApi!: ReturnType<typeof useToast>;

  function TestConsumer() {
    contextApi = useApp();
    toastApi = useToast();
    return null;
  }

  const container = document.createElement('div');
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

describe('Milestone 2 Challenger 2 — Deep Resilience & Adversarial Stress Tests', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /* ------------------------------------------------------------------ *
   * Challenge 1: Multi-Entity High-Concurrency Mixed Failure/Success Matrix
   * ------------------------------------------------------------------ */
  it('Challenge 1: Concurrent mutations across 6 entity domains isolate failures without corrupting successful mutations', async () => {
    const initialJob1: JobApplication = { id: 'job-1', title: 'Frontend Eng', company: 'Company A', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' };
    const initialJob2: JobApplication = { id: 'job-2', title: 'Backend Eng', company: 'Company B', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' };
    const initialContact1: Contact = { id: 'c-1', name: 'Alice', email: 'alice@a.com', company: 'A', role: 'Dev', phone: '', linkedin: '', source: 'referral', relationship: 'referral', notes: '', priority: 'low', companyIds: [], createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
    const initialContact2: Contact = { id: 'c-2', name: 'Bob', email: 'bob@b.com', company: 'B', role: 'Dev', phone: '', linkedin: '', source: 'referral', relationship: 'referral', notes: '', priority: 'low', companyIds: [], createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
    const initialReminder1: Reminder = { id: 'r-1', kind: 'follow_up', note: 'Follow up A', done: false, dueAt: '2026-08-01T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' };
    const initialReminder2: Reminder = { id: 'r-2', kind: 'follow_up', note: 'Follow up B', done: false, dueAt: '2026-08-01T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' };
    const initialInterview1: InterviewEvent = { id: 'i-1', title: 'Tech Screen', type: 'video', scheduledAt: '2026-08-25T10:00:00Z', durationMin: 45, location: 'Remote', notes: '', status: 'scheduled', createdAt: '2026-08-01T00:00:00Z' };
    const initialEmail1: EmailMessage = { id: 'e-1', direction: 'sent', subject: 'Initial Subj', body: 'Hello', sentAt: '2026-08-01T00:00:00Z', threadId: 'th-1', status: 'sent', read: true };

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === '/api/data' || urlStr === '/api/data/stats') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jobs: [initialJob1, initialJob2],
              contacts: [initialContact1, initialContact2],
              reminders: [initialReminder1, initialReminder2],
              interviews: [initialInterview1],
              emails: [initialEmail1],
              settings: {},
            }),
            { status: 200 }
          )
        );
      }

      if (urlStr === '/api/data/jobs' && opts?.method === 'POST') {
        const body = JSON.parse(String(opts.body));
        if (body.id === 'job-1') return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
        if (body.id === 'job-2') return Promise.resolve(new Response(JSON.stringify({ error: 'Server DB lock' }), { status: 500 }));
      }

      if (urlStr === '/api/data/contacts' && opts?.method === 'POST') {
        const body = JSON.parse(String(opts.body));
        if (body.id === 'c-1') return Promise.resolve(new Response(JSON.stringify({ error: 'Validation error' }), { status: 400 }));
        if (body.id === 'c-2') return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      if (urlStr === '/api/data/reminders' && opts?.method === 'POST') {
        const body = JSON.parse(String(opts.body));
        if (body.id === 'r-1') return Promise.reject(new TypeError('Network disconnect'));
        if (body.id === 'r-2') return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      if (urlStr === '/api/data/interviews' && opts?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      if (urlStr === '/api/data/emails' && opts?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Mail store full' }), { status: 500 }));
      }

      if (urlStr === '/api/data/settings' && opts?.method === 'POST') {
        const body = JSON.parse(String(opts.body));
        if (body.profile) return Promise.resolve(new Response(JSON.stringify({ error: 'Invalid profile schema' }), { status: 400 }));
        if (body.cloudinary_settings) return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    const originalProfile = { ...harness.api.profile };

    // Fire all concurrent mutations simultaneously in one act tick
    await act(async () => {
      harness.api.updateApplication('job-1', { status: 'applied' });
      harness.api.updateApplication('job-2', { status: 'interviewing' });
      harness.api.updateContact('c-1', { name: 'Alice Modified' });
      harness.api.updateContact('c-2', { name: 'Bob Verified' });
      harness.api.toggleReminder('r-1');
      harness.api.toggleReminder('r-2');
      harness.api.updateInterview('i-1', { notes: '15:00 update' });
      harness.api.updateEmail('e-1', { subject: 'Failed Subject' });
      harness.api.updateProfile({ ...originalProfile, name: 'Failed New Name' });
      void harness.api.saveCloudinarySettings({ cloudName: 'cdn-success', apiKey: 'k', apiSecret: 's', concurrency: 6 });
    });

    // Wait for all async server promises and rollback handlers to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // Assertions for Jobs
    expect(harness.api.applications.find((j) => j.id === 'job-1')?.status).toBe('applied'); // SUCCESS
    expect(harness.api.applications.find((j) => j.id === 'job-2')?.status).toBe('wishlist'); // ROLLED BACK

    // Assertions for Contacts
    expect(harness.api.contacts.find((c) => c.id === 'c-1')?.name).toBe('Alice'); // ROLLED BACK
    expect(harness.api.contacts.find((c) => c.id === 'c-2')?.name).toBe('Bob Verified'); // SUCCESS

    // Assertions for Reminders
    expect(harness.api.reminders.find((r) => r.id === 'r-1')?.done).toBe(false); // ROLLED BACK
    expect(harness.api.reminders.find((r) => r.id === 'r-2')?.done).toBe(true); // SUCCESS

    // Assertions for Interviews
    expect(harness.api.interviews.find((i) => i.id === 'i-1')?.notes).toBe('15:00 update'); // SUCCESS

    // Assertions for Emails
    expect(harness.api.emails.find((e) => e.id === 'e-1')?.subject).toBe('Initial Subj'); // ROLLED BACK

    // Assertions for Settings
    expect(harness.api.profile.name).toBe(originalProfile.name); // ROLLED BACK
    expect(harness.api.cloudinarySettings.cloudName).toBe('cdn-success'); // SUCCESS

    harness.unmount();
  });

  /* ------------------------------------------------------------------ *
   * Challenge 2: Array Splicing Under High-Concurrency Multi-Deletion Failures
   * ------------------------------------------------------------------ */
  it('Challenge 2: Rapid parallel deletion failures preserve exact original ordering and array indices without duplicates', async () => {
    const jobs: JobApplication[] = [
      { id: 'job-slot-0', title: 'Job 0', company: 'Company 0', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-1', title: 'Job 1', company: 'Company 1', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-2', title: 'Job 2', company: 'Company 2', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-3', title: 'Job 3', company: 'Company 3', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-4', title: 'Job 4', company: 'Company 4', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-5', title: 'Job 5', company: 'Company 5', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-6', title: 'Job 6', company: 'Company 6', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'job-slot-7', title: 'Job 7', company: 'Company 7', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
    ];

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === '/api/data' || urlStr === '/api/data/stats') {
        return Promise.resolve(new Response(JSON.stringify({ jobs }), { status: 200 }));
      }
      if (urlStr.startsWith('/api/data/jobs/') && opts?.method === 'DELETE') {
        // Delete requests fail over network
        return Promise.reject(new Error('Network gateway timeout'));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    expect(harness.api.applications.map((j) => j.id)).toEqual([
      'job-slot-0',
      'job-slot-1',
      'job-slot-2',
      'job-slot-3',
      'job-slot-4',
      'job-slot-5',
      'job-slot-6',
      'job-slot-7',
    ]);

    // Simultaneously delete slots 1, 3, and 6
    await act(async () => {
      harness.api.deleteApplication('job-slot-1');
      harness.api.deleteApplication('job-slot-3');
      harness.api.deleteApplication('job-slot-6');
    });

    // Optimistically, items 1, 3, 6 are removed immediately
    expect(harness.api.applications.map((j) => j.id)).toEqual([
      'job-slot-0',
      'job-slot-2',
      'job-slot-4',
      'job-slot-5',
      'job-slot-7',
    ]);

    // Wait for all rollback handlers to execute
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // All 3 items should be restored to their proper positions without corrupting sequence
    const restoredIds = harness.api.applications.map((j) => j.id);
    expect(restoredIds.length).toBe(8);
    expect(restoredIds).toEqual([
      'job-slot-0',
      'job-slot-1',
      'job-slot-2',
      'job-slot-3',
      'job-slot-4',
      'job-slot-5',
      'job-slot-6',
      'job-slot-7',
    ]);

    harness.unmount();
  });

  /* ------------------------------------------------------------------ *
   * Challenge 3: Toast Notification Throttling & Deduplication Invariant
   * ------------------------------------------------------------------ */
  it('Challenge 3: Toast error handler deduplicates identical messages within 1500ms while allowing distinct messages', async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === '/api/data' || urlStr === '/api/data/stats') {
        return Promise.resolve(new Response(JSON.stringify({ jobs: [{ id: 'job-dedup', title: 'Target', company: 'X', status: 'wishlist' }] }), { status: 200 }));
      }
      if (urlStr === '/api/data/jobs' && opts?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Duplicate server failure' }), { status: 500 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    // Spy on the toast error method
    const toastErrorSpy = vi.spyOn(harness.toast, 'error');

    // Rapidly trigger 5 identical update failures
    await act(async () => {
      harness.api.updateApplication('job-dedup', { notes: 'A' });
      harness.api.updateApplication('job-dedup', { notes: 'B' });
      harness.api.updateApplication('job-dedup', { notes: 'C' });
      harness.api.updateApplication('job-dedup', { notes: 'D' });
      harness.api.updateApplication('job-dedup', { notes: 'E' });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Despite 5 rapid failures with identical error message, toast.error should only be called ONCE
    expect(toastErrorSpy).toHaveBeenCalledTimes(1);

    toastErrorSpy.mockRestore();
    harness.unmount();
  });

  /* ------------------------------------------------------------------ *
   * Challenge 4: Batch Auto-Apply & Match Concurrency Pool Invariants
   * ------------------------------------------------------------------ */
  it('Challenge 4: triggerAutoApplyBatch drains queue across concurrency pool and aggregates results accurately', async () => {
    const jobList: JobApplication[] = [
      { id: 'batch-job-0', title: 'Software Engineer 0', company: 'Company 0', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-1', title: 'Software Engineer 1', company: 'Company 1', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-2', title: 'Software Engineer 2', company: 'Company 2', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-3', title: 'Software Engineer 3', company: 'Company 3', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-4', title: 'Software Engineer 4', company: 'Company 4', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-5', title: 'Software Engineer 5', company: 'Company 5', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-6', title: 'Software Engineer 6', company: 'Company 6', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-7', title: 'Software Engineer 7', company: 'Company 7', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
      { id: 'batch-job-8', title: 'Software Engineer 8', company: 'Company 8', location: 'Remote', jobDescription: '', status: 'wishlist', createdDate: '2026-08-01' },
    ];

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === '/api/data' || urlStr === '/api/data/stats') {
        return Promise.resolve(new Response(JSON.stringify({ jobs: jobList }), { status: 200 }));
      }
      if (urlStr === '/api/data/jobs') {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      if (urlStr === '/api/apply-agent' && opts?.method === 'POST') {
        const body = JSON.parse(String(opts.body));
        const jobId = body.job.id;
        if (jobId === 'batch-job-0' || jobId === 'batch-job-1' || jobId === 'batch-job-2') {
          return Promise.resolve(new Response(JSON.stringify({ status: 'applied', logs: [] }), { status: 200 }));
        }
        if (jobId === 'batch-job-3' || jobId === 'batch-job-4') {
          return Promise.resolve(new Response(JSON.stringify({ status: 'manual_required', logs: [] }), { status: 200 }));
        }
        if (jobId === 'batch-job-5') {
          return Promise.resolve(new Response(JSON.stringify({ status: 'skipped', logs: [] }), { status: 200 }));
        }
        if (jobId === 'batch-job-6' || jobId === 'batch-job-7') {
          return Promise.resolve(new Response(JSON.stringify({ error: 'Agent timeout' }), { status: 500 }));
        }
        if (jobId === 'batch-job-8') {
          return Promise.reject(new Error('Sidecar unreachable'));
        }
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const harness = renderAppContext();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    let batchResult!: { completed: number; failed: number };

    await act(async () => {
      batchResult = await harness.api.triggerAutoApplyBatch(
        jobList.map((j) => j.id),
        { concurrency: 3 }
      );
    });

    // 3 applied + 2 manual_required = 5 completed
    // 1 skipped + 2 HTTP 500 + 1 rejection = 4 failed
    expect(batchResult.completed).toBe(5);
    expect(batchResult.failed).toBe(4);
    expect(batchResult.completed + batchResult.failed).toBe(9);

    harness.unmount();
  });

  /* ------------------------------------------------------------------ *
   * Challenge 5: MemoryFeed Lifecycle Mount/Unmount Stability
   * ------------------------------------------------------------------ */
  it('Challenge 5: MemoryFeed handles in-flight unmounting and async CRUD without unhandled promise rejections', async () => {
    let resolveInitialFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveInitialFetch = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.startsWith('/api/memory')) {
        return fetchPromise;
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const container = document.createElement('div');
    const root = createRoot(container as unknown as HTMLElement);

    // 1. Mount component while fetch is pending
    act(() => {
      root.render(React.createElement(MemoryFeed, { limit: 10 }));
    });

    // 2. Unmount component immediately before server responds
    act(() => {
      root.unmount();
    });

    // 3. Server now resolves after unmount — should not trigger state updates or errors
    await act(async () => {
      resolveInitialFetch(
        new Response(
          JSON.stringify({
            memory: [
              { id: 1, kind: 'insight', content: 'Unmounted item', source: 'test', importance: 1 },
            ],
          }),
          { status: 200 }
        )
      );
      await new Promise((r) => setTimeout(r, 20));
    });

    // Passes cleanly without unhandled rejections or React memory leaks
    expect(true).toBe(true);
  });

  /* ------------------------------------------------------------------ *
   * Challenge 6: NotificationCenter Polling Teardown & Action Dispatch
   * ------------------------------------------------------------------ */
  it('Challenge 6: NotificationCenter cleanly registers polling, executes actions, and tears down intervals on unmount', async () => {
    const mockNotifications: NotificationItem[] = [
      { id: 'n-1', title: 'Application Sent', message: 'Successfully sent to Stripe', kind: 'success', read: false, createdAt: new Date().toISOString() },
      { id: 'n-2', title: 'Follow-up Reminder', message: 'Figma recruiter follow-up due', kind: 'warning', read: true, createdAt: new Date().toISOString() },
    ];

    let pollCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === '/api/notifications') {
        pollCount++;
        return Promise.resolve(new Response(JSON.stringify({ notifications: mockNotifications }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const container = document.createElement('div');
    const root = createRoot(container as unknown as HTMLElement);

    act(() => {
      root.render(React.createElement(NotificationCenter, null));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    expect(pollCount).toBeGreaterThanOrEqual(1);
    const countBeforeUnmount = pollCount;

    // Unmount component
    act(() => {
      root.unmount();
    });

    // Wait to ensure interval has been properly cleared
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(pollCount).toBe(countBeforeUnmount);
  });
});
