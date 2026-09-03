"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TieredInterviewQuestion } from "@/lib/agents/interviewTiers";
import { cn } from "@/lib/utils";

type SimulatorStatus =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "stopped"
  | "permission_denied"
  | "unsupported"
  | "error";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
  }>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceStarSimulatorProps {
  question: TieredInterviewQuestion;
  onComplete?: (feedback: {
    score: number;
    fillerWordCount: number;
    durationSeconds: number;
    transcript: string;
  }) => void;
  className?: string;
}

export default function VoiceStarSimulator({
  question,
  onComplete,
  className,
}: VoiceStarSimulatorProps) {
  const [status, setStatus] = useState<SimulatorStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [spokenSeconds, setSpokenSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    score: number;
    wpm: number;
    fillerCount: number;
    starCoverage: { situation: boolean; task: boolean; action: boolean; result: boolean };
    notes: string[];
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check Web Speech API support on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSpeech = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
      if (!hasSpeech && !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const speakQuestion = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(question.question);
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startRecording = async () => {
    setErrorMessage(null);
    setTranscript("");
    setFeedback(null);
    setSpokenSeconds(0);
    setStatus("requesting_permission");

    // 1. Request microphone permission
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }
    } catch {
      setStatus("permission_denied");
      setErrorMessage(
        "Microphone access was denied. Please allow microphone permissions in your browser to record spoken practice answers."
      );
      return;
    }

    // 2. Initialize Web Speech Recognition
    const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
    const SpeechRecognitionClass = (win.SpeechRecognition || win.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionInstance)
      | undefined;

    if (!SpeechRecognitionClass) {
      setStatus("listening");
      // Fallback timer if speech recognition is unsupported in browser
      timerRef.current = setInterval(() => {
        setSpokenSeconds((s) => s + 1);
      }, 1000);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let accumulated = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            accumulated += (accumulated ? " " : "") + res[0].transcript;
          } else {
            currentInterim += res[0].transcript;
          }
        }
        const full = (accumulated + " " + currentInterim).trim();
        setTranscript(full);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== "no-speech") {
          setErrorMessage(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (status === "listening") {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setStatus("listening");

      timerRef.current = setInterval(() => {
        setSpokenSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to start speech recognition");
    }
  };

  const stopRecording = () => {
    setStatus("stopped");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Evaluate ONLY the real captured transcript — no canned substitution
    const cleanTranscript = transcript.trim();

    if (!cleanTranscript || cleanTranscript.length === 0) {
      setFeedback({
        score: 0,
        wpm: 0,
        fillerCount: 0,
        starCoverage: { situation: false, task: false, action: false, result: false },
        notes: [
          "No speech was detected. Please verify your microphone is unmuted and speak clearly during recording.",
        ],
      });
      onComplete?.({
        score: 0,
        fillerWordCount: 0,
        durationSeconds: spokenSeconds,
        transcript: "",
      });
      return;
    }

    const words = cleanTranscript.split(/\s+/).filter(Boolean);
    const durationMin = Math.max(0.08, spokenSeconds / 60);
    const wpm = Math.round(words.length / durationMin);

    const fillerMatches =
      cleanTranscript.match(/\b(um|uh|like|you know|basically|actually|sort of|kind of)\b/gi) || [];
    const fillerCount = fillerMatches.length;

    const lower = cleanTranscript.toLowerCase();
    const starCoverage = {
      situation: /in my (previous|last|past)|at |when |faced |our team|the context|project was/i.test(lower),
      task: /my task|my goal|responsible for|objective was|needed to|charge of/i.test(lower),
      action: /i (built|implemented|architected|designed|restructured|refactored|led|created|developed|spearheaded)/i.test(
        lower
      ),
      result: /result|reduced|increased|improved|saved|drop|achieved|outcome|\d+%|\$\d+/i.test(lower),
    };

    let score = 20; // baseline for attempt
    if (starCoverage.situation) score += 20;
    if (starCoverage.task) score += 20;
    if (starCoverage.action) score += 25;
    if (starCoverage.result) score += 25;

    // Filler penalty
    if (fillerCount > 3) {
      score -= Math.min(20, (fillerCount - 3) * 3);
    }

    // Length check: extremely short answers (<20 words) capped
    if (words.length < 20) {
      score = Math.min(45, score);
    }

    const finalScore = Math.min(100, Math.max(0, score));

    const notes: string[] = [];
    if (starCoverage.result) {
      notes.push("✓ Included quantifiable results or business impact.");
    } else {
      notes.push("⚠️ Missing quantifiable business outcome (e.g. %, $ saved, latency drop).");
    }

    if (!starCoverage.action) {
      notes.push(
        "⚠️ Make sure to use first-person action verbs ('I architected', 'I implemented') rather than passive team phrasing."
      );
    }

    if (wpm >= 120 && wpm <= 165) {
      notes.push(`✓ Excellent conversational speaking pace (${wpm} WPM).`);
    } else if (wpm < 120) {
      notes.push(`⚠️ Speaking pace was slightly deliberate (${wpm} WPM) — target 130-150 WPM.`);
    } else {
      notes.push(`⚠️ Speaking pace was fast (${wpm} WPM) — remember to pause between STAR sections.`);
    }

    if (fillerCount > 2) {
      notes.push(
        `⚠️ Detected ${fillerCount} filler word(s) (${fillerMatches
          .slice(0, 3)
          .join(", ")}). Practice pausing silently instead of using fillers.`
      );
    }

    setFeedback({
      score: finalScore,
      wpm,
      fillerCount,
      starCoverage,
      notes,
    });

    onComplete?.({
      score: finalScore,
      fillerWordCount: fillerCount,
      durationSeconds: spokenSeconds,
      transcript: cleanTranscript,
    });
  };

  const isRecording = status === "listening";

  return (
    <div className={cn("space-y-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--ink-card)]/60 p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--violet)]">
            {question.tier.toUpperCase()} INTERVIEW ROUND
          </span>
          <h4 className="text-sm font-bold text-[var(--paper)] mt-0.5">{question.topic}</h4>
        </div>
        <Button size="sm" variant="outline" onClick={speakQuestion} className="gap-1.5 text-xs">
          <Volume2 className="h-3.5 w-3.5" /> Read Question Aloud
        </Button>
      </div>

      <div className="rounded-2xl border border-[var(--violet)]/25 bg-[var(--violet)]/[0.04] p-5">
        <p className="text-sm font-semibold leading-relaxed text-[var(--paper)]">“{question.question}”</p>
      </div>

      {/* Permission / Unsupported Warning Banner */}
      {status === "permission_denied" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--coral)]/30 bg-[var(--coral)]/10 p-4 text-xs text-[var(--coral)]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Microphone Permission Denied</p>
            <p className="mt-0.5 leading-relaxed text-dim">{errorMessage}</p>
          </div>
        </div>
      )}

      {status === "unsupported" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4 text-xs text-[var(--amber)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Web Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Brave for live audio
            transcription.
          </p>
        </div>
      )}

      {/* Recording Controls */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-white/[0.02] p-8 space-y-4 text-center">
        <div className="flex items-center gap-4">
          {!isRecording ? (
            <button
              type="button"
              disabled={status === "unsupported"}
              onClick={startRecording}
              className="grid h-16 w-16 place-items-center rounded-full bg-[var(--chartreuse)] text-neutral-950 shadow-[0_4px_24px_rgba(185,237,87,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Mic className="h-7 w-7" />
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="grid h-16 w-16 place-items-center rounded-full bg-[var(--coral)] text-white shadow-[0_4px_24px_rgba(255,107,107,0.35)] animate-pulse hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <MicOff className="h-7 w-7" />
            </button>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--paper)]">
            {isRecording
              ? `Recording practice answer... (${spokenSeconds}s)`
              : "Click the microphone to start real spoken answer practice."}
          </p>
          <p className="text-[11px] text-dim mt-0.5">
            Uses real Web Speech recognition to capture your voice, evaluate pacing, filler words, and STAR structure.
          </p>
        </div>

        {/* Live Streaming Transcript Window */}
        {(transcript || isRecording) && (
          <div className="w-full max-w-xl text-left rounded-xl border border-[var(--line)] bg-[var(--ink-soft)]/60 p-4 text-xs font-mono leading-relaxed space-y-1">
            <p className="text-[10px] uppercase font-bold text-dim tracking-wider">Live Captured Transcript:</p>
            <p className="text-[var(--paper)]/90">
              {transcript || <span className="italic text-dim">Listening... speak into your microphone...</span>}
            </p>
          </div>
        )}
      </div>

      {/* Live Feedback Score Card */}
      {feedback && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink-soft)]/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "font-display text-base font-bold",
                feedback.score >= 70
                  ? "text-[var(--chartreuse)]"
                  : feedback.score >= 40
                    ? "text-[var(--amber)]"
                    : "text-[var(--coral)]"
              )}
            >
              Practice Score: {feedback.score}/100
            </span>
            <span className="font-mono text-xs text-dim">
              {feedback.wpm} WPM · {feedback.fillerCount} filler word(s)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(feedback.starCoverage).map(([comp, covered]) => (
              <div
                key={comp}
                className={cn(
                  "rounded-xl border p-2.5 text-center capitalize font-semibold",
                  covered
                    ? "border-[var(--chartreuse)]/30 bg-[var(--chartreuse)]/10 text-[var(--chartreuse)]"
                    : "border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]"
                )}
              >
                {comp}: {covered ? "✓ Passed" : "✗ Missing"}
              </div>
            ))}
          </div>

          <ul className="list-disc pl-4 space-y-1 text-xs text-dim">
            {feedback.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
