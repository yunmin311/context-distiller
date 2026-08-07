/**
 * Lightweight Markdown → readable plain text, for DISPLAY only.
 *
 * The side panel shows conversation text; ChatGPT hands us Markdown source
 * (`##`, `**`, `>`, list markers …) which is noisy to read. Rather than ship a
 * full Markdown renderer (heavy), we strip the common syntax so the panel reads
 * cleanly. This is purely cosmetic: the fragments the user selects and the text
 * the compiler emits keep their original Markdown — the AI benefits from it.
 */
/**
 * Above this size we skip the inline passes below. They use lazy backreferences
 * (`(.+?)\1`) whose worst case is quadratic, so a pathological megabyte-long
 * message (a pasted dump, adversarial input) could otherwise freeze the panel.
 * The collapsed view only shows the first ~220 chars anyway, and the compiler
 * keeps the original text, so dropping cosmetic inline-stripping on giant
 * messages costs nothing real. The line-level passes further down are all linear
 * and always run.
 */
const INLINE_STRIP_LIMIT = 20_000;

export function plainify(md: string): string {
  if (!md) return md;
  let out = md;

  if (md.length <= INLINE_STRIP_LIMIT) {
    // images ![alt](url) → alt, links [text](url) → text
    out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    // bold / italic (** __ before * _), keep inner text
    out = out.replace(/(\*\*|__)(.+?)\1/g, '$2');
    out = out.replace(/(\*|_)(.+?)\1/g, '$2');
    // strikethrough ~~x~~ → x
    out = out.replace(/~~(.+?)~~/g, '$1');
    // inline code `x` → x
    out = out.replace(/`([^`]+)`/g, '$1');
  }

  out = out
    .split('\n')
    .filter((line) => !/^\s*```/.test(line)) // drop code-fence lines
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '') // # headings
        .replace(/^\s{0,3}>\s?/, '') // > blockquote
        .replace(/^(\s*)[-*+]\s+/, '$1• '), // - * + bullets → •
    )
    .join('\n')
    // collapse 3+ blank lines the stripping may leave behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;
}
