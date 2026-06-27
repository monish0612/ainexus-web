import { vi } from 'vitest';

// jsdom doesn't implement scrollIntoView, but several components call it on
// mount/update (e.g. the article follow-up chat auto-scrolls). Stub it so
// component tests don't crash on the missing API.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
