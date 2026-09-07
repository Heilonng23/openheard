import { useSyncExternalStore } from "react";

export type PendingAction =
  | { type: "vote"; postId: number }
  | { type: "compose" }
  | { type: "comment"; postId: number; body: string };

const STORAGE_KEY = "openheard:pending-action";

let dialogOpen = false;
let pendingAction: PendingAction | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function openSignIn(action: PendingAction) {
  pendingAction = action;
  dialogOpen = true;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  emit();
}

export function closeSignIn() {
  dialogOpen = false;
  pendingAction = null;
  sessionStorage.removeItem(STORAGE_KEY);
  emit();
}

export function consumePendingAction(): PendingAction | null {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  pendingAction = null;
  if (!stored) return null;
  try {
    return JSON.parse(stored) as PendingAction;
  } catch {
    return null;
  }
}

function getDialogOpen() {
  return dialogOpen;
}

function getAction() {
  return pendingAction;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSignInDialog() {
  const open = useSyncExternalStore(subscribe, getDialogOpen, () => false);
  const action = useSyncExternalStore(subscribe, getAction, () => null);
  return { open, action };
}
