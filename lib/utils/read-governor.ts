import type { ConversationMessage } from '../core/types';

/**
 * Read gate — the panel's entire throttle policy for BACKEND conversation reads,
 * as pure, testable logic.
 *
 * Why this exists: every non-domOnly read is a full `/backend-api/conversation`
 * fetch that shares the user's rate-limit budget with ChatGPT's own page. The
 * 1.3.x trigger paths (open upgrade, stream poll, end-of-stream catch-up,
 * growth re-reads, deep-load finale) could overlap freely and hammer the
 * endpoint. Since v1.4: at most ONE backend read in flight, at most one per
 * gap window — unless the USER explicitly asked (refresh / deep-load finish),
 * which skips the gap but still never overlaps.
 */

/** Minimum wall-clock gap between two automatic backend reads. */
export const BACKEND_MIN_GAP_MS = 20_000;

export interface GateAdmission {
  lastBackendReadAt: number;
  now: number;
  inFlight: boolean;
  /** User-invoked reads skip the gap window (but never run concurrently). */
  force?: boolean;
}

export function shouldReadBackend(opts: GateAdmission): boolean {
  if (opts.inFlight) return false;
  if (opts.force) return true;
  return opts.now - opts.lastBackendReadAt >= BACKEND_MIN_GAP_MS;
}

/**
 * Stateful gate used by the panel's read path. A singleton — every trigger in
 * the panel goes through the SAME gate, which is the whole point.
 */
export class ReadGate {
  /** -Infinity: a gate that has never run a read always admits the first one. */
  private lastAt = Number.NEGATIVE_INFINITY;
  private busy = false;

  /** True when the caller may start a backend read right now. */
  admit(force = false, now = Date.now()): boolean {
    if (!shouldReadBackend({ lastBackendReadAt: this.lastAt, now, inFlight: this.busy, force })) {
      return false;
    }
    this.busy = true;
    return true;
  }

  /** Call in `finally` after the read settles — success or failure both count:
   *  a failed request consumed rate-limit budget just the same. */
  release(now = Date.now()): void {
    this.busy = false;
    this.lastAt = now;
  }

  get inFlight(): boolean {
    return this.busy;
  }
}

/** The panel's one gate. domOnly reads (pure DOM, zero requests) bypass it. */
export const readGate = new ReadGate();

/**
 * Cheap identity of a message list: length + id order + total text size. Two
 * reads of an unchanged conversation produce the same signature, letting the
 * reducer skip the update (no re-render, no viewport snap) instead of
 * re-rendering identical content after every background poll.
 */
export function messageSignature(messages: ConversationMessage[]): string {
  let chars = 0;
  for (const m of messages) chars += m.text.length;
  return `${messages.length}|${chars}|${messages.map((m) => m.id).join(',')}`;
}

export function sameMessages(a: ConversationMessage[], b: ConversationMessage[]): boolean {
  return a === b || (a.length === b.length && messageSignature(a) === messageSignature(b));
}
