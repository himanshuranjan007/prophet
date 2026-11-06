"use client";

import { useSyncExternalStore } from "react";

/** App-wide "connect a wallet" modal state. Any component can open it (header, bet panel, resolve…). */
type State = { open: boolean; nonce: number };

let state: State = { open: false, nonce: 0 };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const walletModal = {
  /** `nonce` changes on every open, so the modal body remounts with fresh state. */
  open() {
    state = { open: true, nonce: state.nonce + 1 };
    emit();
  },
  close() {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
  },
};

const SERVER: State = { open: false, nonce: 0 };

export function useWalletModal() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => SERVER,
  );
}
