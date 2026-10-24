/**
 * Paste-import splitter.
 *
 * The manual paste path is the product's floor: when ChatGPT's read path is
 * broken by an update, the user can paste conversation text straight in. Pure
 * and deterministic — same text, same turns, every time.
 *
 * Deliberately NOT clever: a turn boundary is a line that STARTS with a known
 * speaker prefix (你： / AI： / User: / Assistant: …). Anything else continues
 * the current turn. Unparsable text stays ONE turn with the caller's fallback
 * role — no guessing beyond prefixes.
 */

export type PasteRole = 'user' | 'assistant';

export interface PastedTurn {
  role: PasteRole;
  text: string;
}

// Speaker prefixes. The optional 说 covers ChatGPT's own SSR fallback rendering
// ("你说：…" / "ChatGPT 说：…") — the same grammar users paste, so one parser
// serves both.
const USER_PREFIX_RE = /^\s*(?:你|我|用户|人类|user|human)(?:\s*说)?\s*[:：]\s?/i;
const ASSISTANT_PREFIX_RE =
  /^\s*(?:ai|chatgpt|gpt|claude|gemini|assistant|bot|机器人)(?:\s*说)?\s*[:：]\s?/i;

function roleOf(line: string): PasteRole | null {
  if (USER_PREFIX_RE.test(line)) return 'user';
  if (ASSISTANT_PREFIX_RE.test(line)) return 'assistant';
  return null;
}

/** Number of lines that open a prefixed turn — drives the UI's split button. */
export function countTurnPrefixes(text: string): number {
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (roleOf(line)) n += 1;
  }
  return n;
}

/**
 * Split pasted text into turns. Lines with a speaker prefix open a new turn of
 * that role; every other line appends to the current turn. A leading block
 * before any prefix — or the whole text when nothing matches — becomes one turn
 * with `fallbackRole`.
 */
export function splitPastedConversation(
  text: string,
  fallbackRole: PasteRole = 'assistant',
): PastedTurn[] {
  const turns: PastedTurn[] = [];
  let current: PastedTurn | null = null;

  for (const line of text.split(/\r?\n/)) {
    const role = roleOf(line);
    if (role) {
      // Strip the prefix itself — the role label must not leak into the text
      // that gets compiled.
      const body = line.replace(role === 'user' ? USER_PREFIX_RE : ASSISTANT_PREFIX_RE, '');
      current = { role, text: body };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { role: fallbackRole, text: line };
      turns.push(current);
      continue;
    }
    current.text += `\n${line}`;
  }

  // Trim turn edges and drop turns that ended up empty (e.g. a bare "AI：" line).
  const cleaned = turns
    .map((t) => ({ role: t.role, text: t.text.trim() }))
    .filter((t) => t.text !== '');
  return cleaned.length > 0 ? cleaned : [{ role: fallbackRole, text: text.trim() }];
}
