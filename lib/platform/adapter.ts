import type { MessageSource } from '../core/types';

/** A message as read straight from a platform, before normalization. */
export interface RawMessage {
  id?: string;
  /** Raw role string from the platform; normalized later. */
  role: string;
  text: string;
  source: MessageSource;
}

/**
 * Everything that is specific to one AI platform's page lives behind this
 * interface. The rest of the extension (normalizer, compiler, React UI) depends
 * only on the interface, never on ChatGPT/Claude/Gemini selectors — so adding a
 * platform later means adding an adapter, not touching the core.
 */
export interface PlatformAdapter {
  /** Stable id, e.g. `chatgpt`. Also used as ConversationInfo.platform. */
  readonly id: string;
  /** Human label for the UI. */
  readonly label: string;
  /** Filename of the main-world bridge script to inject, if any. */
  readonly mainWorldScript?: string;

  matchesUrl(url: string): boolean;
  getConversationTitle(): string;

  /** DOM fallback: read mounted messages straight from the page DOM. */
  extractFromDom(): RawMessage[];

  /** Find the page's message composer (input box). */
  findComposer(): HTMLElement | null;

  /**
   * Write `text` into the composer WITHOUT sending. Returns whether the write
   * appears to have succeeded; callers must always keep clipboard copy as a
   * backup path (see 计划书 §6.6).
   */
  fillComposer(text: string): Promise<boolean>;

  /** Locate the DOM element for a message id, for source highlighting. */
  locateMessageElement(messageId: string): HTMLElement | null;
}

const registry: PlatformAdapter[] = [];

export function registerAdapter(adapter: PlatformAdapter): void {
  if (!registry.some((a) => a.id === adapter.id)) registry.push(adapter);
}

export function getAdapterForUrl(url: string): PlatformAdapter | undefined {
  return registry.find((a) => a.matchesUrl(url));
}

export function getRegisteredAdapters(): readonly PlatformAdapter[] {
  return registry;
}
