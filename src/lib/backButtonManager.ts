/**
 * Global Hardware & Gesture Back Button Manager
 * Maintains a LIFO (Last-In, First-Out) stack of modal handlers.
 * When Android hardware back, swipe-back gesture, or browser back is triggered,
 * the top-most open modal/dialog/sheet is closed first.
 */

type BackActionHandler = () => boolean;

// Priority stack of active handlers
const activeHandlers: BackActionHandler[] = [];

/**
 * Register a modal/panel back handler.
 * Returns an unregister cleanup function.
 */
export function registerBackHandler(handler: BackActionHandler): () => void {
  activeHandlers.push(handler);

  // Push state to browser history if possible, to enable popstate interception
  try {
    window.history.pushState({ modalLevel: activeHandlers.length }, '');
  } catch (e) {
    // Ignore in non-browser envs
  }

  return () => {
    const idx = activeHandlers.lastIndexOf(handler);
    if (idx !== -1) {
      activeHandlers.splice(idx, 1);
    }
  };
}

/**
 * Execute the topmost back handler.
 * Returns true if an active modal handled the event, false otherwise.
 */
export function executeBackAction(): boolean {
  for (let i = activeHandlers.length - 1; i >= 0; i--) {
    const handler = activeHandlers[i];
    try {
      const handled = handler();
      if (handled) {
        return true;
      }
    } catch (err) {
      console.warn('Error in back action handler:', err);
    }
  }
  return false;
}

/**
 * Check if any back handler is registered in the stack
 */
export function hasActiveBackHandlers(): boolean {
  return activeHandlers.length > 0;
}
