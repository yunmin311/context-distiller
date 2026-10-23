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

/** Composer STOP button while generating, or the streaming highlight class.
 *  Either alone means "an answer is being generated". */
export const GENERATING_SELECTOR = '[data-testid="stop-button"], .result-streaming';

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

// --- React internals (main world only) ----------------------------------------

/** Expando keys React injects on rendered elements; walking them reaches props. */
export const FIBER_KEY_PREFIXES = ['__reactFiber$', '__reactInternalInstance$'];
