/**
 * Identity of a conversation, derived from its URL.
 *
 * Used to tell "the same thread was re-read" from "the user switched threads".
 * That distinction decides whether the selected material survives a read, so it
 * has to be right in both directions: too loose and two conversations' material
 * silently mixes in the workspace; too strict and a plain refresh throws away
 * work the user just did.
 *
 * ChatGPT conversation URLs carry the id in a `/c/<id>` segment. Everything after
 * it (query string, hash, a trailing slash) is navigation noise, not identity.
 * A URL with no `/c/` segment (a brand-new, unsaved chat) falls back to the path,
 * so such a chat still compares equal to itself.
 */
export function conversationKey(url: string): string {
  if (!url) return '';
  const id = /\/c\/([\w-]+)/.exec(url)?.[1];
  if (id) return id;
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  const end = Math.min(q === -1 ? url.length : q, h === -1 ? url.length : h);
  return url.slice(0, end).replace(/\/+$/, '');
}
