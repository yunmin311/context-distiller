import { describe, expect, it } from 'vitest';
import { nextSeekTop, seekDirection } from './seek-step';

describe('seekDirection', () => {
  it('points down when nothing is mounted yet', () => {
    expect(seekDirection(7, [])).toBe(1);
  });

  it('points up when the target is above the mounted band', () => {
    expect(seekDirection(2, [10, 11, 12])).toBe(-1);
  });

  it('points down when the target is below the mounted band', () => {
    expect(seekDirection(40, [10, 11, 12])).toBe(1);
  });

  it('reports in-band (0) whether the band is one message or many', () => {
    expect(seekDirection(11, [10, 11, 12])).toBe(0);
    expect(seekDirection(10, [10])).toBe(0);
    // Boundary semantics: equal to min/max counts as inside.
    expect(seekDirection(12, [10, 11, 12])).toBe(0);
  });
});

describe('nextSeekTop', () => {
  it('steps by exactly `step` in the given direction', () => {
    expect(nextSeekTop(1000, 1, 600, 5000)).toBe(1600);
    expect(nextSeekTop(1000, -1, 600, 5000)).toBe(400);
  });

  it('clamps to [0, extent]', () => {
    expect(nextSeekTop(4800, 1, 600, 5000)).toBe(5000);
    expect(nextSeekTop(300, -1, 600, 5000)).toBe(0);
  });

  it('returns null when pinned and still not there — stop hunting', () => {
    expect(nextSeekTop(5000, 1, 600, 5000)).toBeNull();
    expect(nextSeekTop(0, -1, 600, 5000)).toBeNull();
    expect(nextSeekTop(2000, 1, 0, 5000)).toBeNull();
  });
});
