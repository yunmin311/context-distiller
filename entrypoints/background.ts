/**
 * Service Worker.
 *
 * Responsibilities (计划书 §8.2): open the side panel and coordinate extension
 * events. It is NOT a server or database — it holds no conversation data.
 */
export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel on the current tab.
  void browser.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch((err: unknown) =>
      console.debug('[Context Distiller] setPanelBehavior failed:', err),
    );

  // Fallback for browsers/versions where the behavior flag is not honored.
  browser.action?.onClicked?.addListener((tab) => {
    if (tab.windowId != null) {
      void browser.sidePanel?.open?.({ windowId: tab.windowId })?.catch(() => {});
    }
  });
});
