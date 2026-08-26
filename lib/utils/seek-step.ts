/**
 * The seek algorithm's decision core, extracted so it can be unit-tested.
 *
 * `seekToMessage` (chatgpt.content.ts) scrolls a virtualized list toward a
 * message that isn't mounted. Its history of bugs (oscillation, overshoot,
 * endless hunts) all lived in the two decisions below — now they're pure and
 * pinned by tests; the content script only does the DOM/timing around them.
 */

/** Which way to scroll: -1 = up, 1 = down, 0 = inside the mounted band. */
export type SeekDir = -1 | 0 | 1;

/**
 * Compare the target's position against the band of orders currently mounted.
 * An empty mount means the virtualizer hasn't painted anything yet — assume the
 * target is below and start moving down.
 */
export function seekDirection(targetOrder: number, mountedOrders: number[]): SeekDir {
  if (mountedOrders.length === 0) return 1;
  let min = Infinity;
  let max = -Infinity;
  for (const o of mountedOrders) {
    if (o < min) min = o;
    if (o > max) max = o;
  }
  if (targetOrder < min) return -1;
  if (targetOrder > max) return 1;
  return 0;
}

/**
 * One step from `top` in direction `dir`, clamped to [0, extent]. Returns null
 * when pinned at an end and still not there — the caller must give up instead
 * of scrolling forever.
 */
export function nextSeekTop(
  top: number,
  dir: Exclude<SeekDir, 0>,
  step: number,
  extent: number,
): number | null {
  const next = Math.max(0, Math.min(extent, top + dir * step));
  return next === top ? null : next;
}
