/**
 * ChatGPT coupling markers — EVERY ChatGPT-specific selector, endpoint and
 * pattern in one file. If ChatGPT changes its markup, this is the first (and
 * usually only) place to look.
 *
 * This file is also scanned by the external compatibility probe (`--sync`),
 * which extracts these literals and watches the live chatgpt.com build for
 * them — so a rename here automatically updates the monitor.
 */

// --- Page origin & conversation URL -----------------------------------------

/** Origins the extension is allowed to run on / talk to. */
export const CHATGPT_ORIGIN_RE = /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//;

/** A conversation page path: /c/<uuid>. */
export const CONVERSATION_ID_RE = /\/c\/([\w-]+)/;

// --- Backend endpoints (page-world fetches with the user's own session) ------

/** Session endpoint — the source of the short-lived access token. */
export const SESSION_ENDPOINT = '/api/auth/session';

/** The full-conversation endpoint the extension reads through. */
export const conversationEndpoint = (convId: string): string =>
  `/backend-api/conversation/${convId}`;

// --- DOM selectors -----------------------------------------------------------

/** Any rendered message bubble (both roles), mounted or not at all. */
export const MESSAGE_SELECTOR = '[data-message-author-role]';

/** Attribute carrying a message's stable id. */
export const MESSAGE_ID_ATTR = 'data-message-id';

/** Attribute carrying a message's author role. */
export const AUTHOR_ROLE_ATTR = 'data-message-author-role';

/** Selector for one message by id (CSS-escaped). */
export const messageByIdSelector = (id: string): string =>
  `[data-message-id="${CSS.escape(id)}"]`;

/** The composer input (textarea on older builds, ProseMirror contenteditable now). */
export const COMPOSER_SELECTOR =
  '#prompt-textarea, textarea[data-testid="prompt-textarea"], div[contenteditable="true"]#prompt-textarea';

/** Composer STOP button shown while an answer is generating. */
export const STOP_BUTTON_SELECTOR = '[data-testid="stop-button"]';

/** Highlight class on the answer currently streaming in. */
export const STREAMING_CLASS_SELECTOR = '.result-streaming';

/** Active conversation title in ChatGPT's sidebar nav. */
export const TITLE_NAV_SELECTOR = 'nav a[aria-current="page"], nav li[data-active] a';

/** Trailing " - ChatGPT" style suffix on document.title. */
export const TITLE_SUFFIX_RE = /\s*[-|]\s*ChatGPT\s*$/i;

/** The composer's send button (accent-color detection). */
export const SEND_BUTTON_SELECTOR = '[data-testid="send-button"]';

// --- Theme -------------------------------------------------------------------

/** CSS custom properties ChatGPT has been known to expose its accent through. */
export const THEME_ACCENT_VARS = [
  '--interactive-bg-accent-default',
  '--interactive-label-accent-default',
  '--accent-primary',
  '--brand-purple',
  '--link',
  '--text-accent',
];

// --- New app-shell (2025+ build; confirmed live 2026-10) ----------------------
//
// The new shell renders turns with a DIFFERENT attribute set and hydrates
// late (often never, in stale/automated tabs). Confirmed on a real page:
//   [data-turn-key]           → one per turn; value = the message UUID
//   [data-conversation-role]  → on an sr-only <h4> INSIDE assistant turns
//                               (absent on user turns → default 'user')
//   [data-talvt-turn-state]   → "complete" when settled; other values stream
//   .thread-scroll-container  → the conversation scroller

/** One conversation turn in the new shell. */
export const TURN_SELECTOR = '[data-turn-key]';

/**
 * The new shell's MESSAGE-ID anchor: a space-separated list of backend message
 * ids on each turn (E2E-verified: the panel's backend ids appear verbatim in
 * these lists). Do NOT use the turn's own data-turn-key for this — it is a
 * DIFFERENT id namespace (turn key, not message id).
 */
export const TURN_MESSAGE_IDS_ATTR = 'data-chatgpt-search-message-ids';

/** Role attribute on the sr-only heading inside assistant turns. */
export const TURN_ROLE_ATTR = 'data-conversation-role';

/** Per-turn lifecycle state; anything but "complete" means it is streaming. */
export const TURN_STATE_ATTR = 'data-talvt-turn-state';
export const TURN_COMPLETE_STATE = 'complete';

/** The conversation scroller in the new shell. */
export const THREAD_SCROLL_SELECTOR = '.thread-scroll-container';

/** All elements that can anchor a backend message id, either shell. */
export const MESSAGE_ANCHOR_SELECTOR = `[${TURN_MESSAGE_IDS_ATTR}], [${MESSAGE_ID_ATTR}]`;

/** Selector matching a message by id in EITHER the new shell or the legacy DOM. */
export const messageByAnyIdSelector = (id: string): string =>
  `[data-chatgpt-search-message-ids~="${CSS.escape(id)}"], [data-message-id="${CSS.escape(id)}"]`;

// --- React internals (main world only) ----------------------------------------

/** Expando keys React injects on rendered elements; walking them reaches props. */
export const FIBER_KEY_PREFIXES = ['__reactFiber$', '__reactInternalInstance$'];
