"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError } from "viem";

/** Runs a multi-step tx flow with a readable step label + error; refreshes every on-chain read when done. */
export function useAction() {
  const qc = useQueryClient();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: (setStep: (s: string) => void) => Promise<void>) {
    setError(null);
    setStep("starting…");
    try {
      await fn(setStep);
    } catch (e) {
      const msg = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
      setError(msg.length > 220 ? msg.slice(0, 220) + "…" : msg);
    } finally {
      setStep(null);
      // positions, pools, activity, balances: all stale after any tx
      void qc.invalidateQueries();
    }
  }
  return { run, step, busy: step !== null, error, clearError: () => setError(null) };
}
