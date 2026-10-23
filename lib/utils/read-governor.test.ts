import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationMessage } from '../core/types';
import { BACKEND_MIN_GAP_MS, ReadGate, messageSignature, sameMessages } from './read-governor';

const msg = (id: string, text = 'x'): ConversationMessage => ({
  id,
  role: 'user',
  text,
  order: 0,
});

describe('shouldReadBackend / ReadGate', () => {
  it('refuses while a read is in flight, even for force', () => {
    const gate = new ReadGate();
    expect(gate.admit(true, 1000)).toBe(true);
    expect(gate.admit(true, 2000)).toBe(false); // single-flight
    gate.release(2000);
    expect(gate.admit(true, 2001)).toBe(true);
  });

  it('enforces the minimum gap for automatic reads', () => {
    const gate = new ReadGate();
    expect(gate.admit(false, 0)).toBe(true);
    gate.release(0);
    expect(gate.admit(false, BACKEND_MIN_GAP_MS - 1)).toBe(false);
    expect(gate.admit(false, BACKEND_MIN_GAP_MS)).toBe(true);
  });

  it('force skips the gap but still respects single-flight', () => {
    const gate = new ReadGate();
    gate.admit(false, 0);
    gate.release(0);
    expect(gate.admit(true, 5)).toBe(true); // user asked — no gap needed
  });

  it('release stamps the time so a failed read still consumes the gap', () => {
    const gate = new ReadGate();
    gate.admit(true, 0);
    gate.release(500); // the read finished (failed) at t=500
    expect(gate.admit(false, 500 + BACKEND_MIN_GAP_MS - 1)).toBe(false);
    expect(gate.admit(false, 500 + BACKEND_MIN_GAP_MS)).toBe(true);
  });

  it('acquire DEFERS a background read until the gap elapses (never drops it)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    try {
      const gate = new ReadGate();
      gate.admit(false);
      gate.release(50_000); // gap ends at 50_000 + BACKEND_MIN_GAP_MS
      const p = gate.acquire({ maxWaitMs: 30_000, pollMs: 100 });
      let result: boolean | undefined;
      void p.then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(BACKEND_MIN_GAP_MS - 500);
      expect(result).toBeUndefined(); // still deferring
      await vi.advanceTimersByTimeAsync(1_500);
      expect(result).toBe(true); // deferred — then admitted
    } finally {
      vi.useRealTimers();
    }
  });

  it('acquire returns false when the wait budget runs out (busy forever)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    try {
      const gate = new ReadGate();
      gate.admit(true); // busy, never released
      const p = gate.acquire({ force: true, maxWaitMs: 1_000, pollMs: 100 });
      let result: boolean | undefined;
      void p.then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(1_500);
      expect(result).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('acquire with force admits immediately when idle, even inside a gap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    try {
      const gate = new ReadGate();
      gate.admit(false);
      gate.release(50_000);
      const ok = await gate.acquire({ force: true, maxWaitMs: 100, pollMs: 10 });
      expect(ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('sameMessages', () => {
  it('same content → true, regardless of object identity', () => {
    const a = [msg('m1', 'hello'), msg('m2', 'world')];
    const b = [msg('m1', 'hello'), msg('m2', 'world')];
    expect(sameMessages(a, b)).toBe(true);
    expect(sameMessages(a, a)).toBe(true);
  });

  it('different length, order, ids or text size → false', () => {
    const a = [msg('m1', 'hello'), msg('m2', 'world')];
    expect(sameMessages(a, [msg('m1', 'hello')])).toBe(false);
    expect(sameMessages(a, [msg('m2', 'world'), msg('m1', 'hello')])).toBe(false);
    expect(sameMessages(a, [msg('m1', 'hello'), msg('m9', 'world')])).toBe(false);
    expect(sameMessages(a, [msg('m1', 'hello!'), msg('m2', 'world')])).toBe(false);
  });

  it('messageSignature is stable and length-sensitive', () => {
    expect(messageSignature([msg('a'), msg('b')])).toBe(messageSignature([msg('a'), msg('b')]));
    expect(messageSignature([msg('a', 'abc')])).not.toBe(messageSignature([msg('a', 'abcd')]));
  });
});
