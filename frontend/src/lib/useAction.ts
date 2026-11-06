"use client";

import { useState } from "react";
import { BaseError } from "viem";

/** Runs a multi-step async tx flow with a human-readable step label and error. */
export function useAction() {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: (setStep: (s: string) => void) => Promise<void>) {
    setError(null);
    setStep("Starting…");
    try {
      await fn(setStep);
    } catch (e) {
      const msg = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
      setError(msg.length > 220 ? msg.slice(0, 220) + "…" : msg);
    } finally {
      setStep(null);
    }
  }
  return { run, step, busy: step !== null, error, clearError: () => setError(null) };
}
