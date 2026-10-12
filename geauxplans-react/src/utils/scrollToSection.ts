/**
 * Scroll a section into view, accounting for the fixed site header and for
 * layout that settles a beat later (async data, panels that expand on arrival).
 *
 * `scrollIntoView({ block: 'start' })` leaves the target tucked UNDER the sticky
 * `#site-header`, and a single scroll fires before late content has grown the
 * page — which is why section links were landing "halfway". This instead:
 *   1. waits (retrying) until the element exists,
 *   2. scrolls so its top clears the real header height, then
 *   3. re-snaps a couple of times once the layout has settled.
 */
export function scrollToSection(id: string): void {
  let tries = 0;

  const headerOffset = (): number => {
    const header = document.getElementById('site-header');
    // +14px breathing room below the header.
    return (header?.offsetHeight || 70) + 14;
  };

  const doScroll = (smooth: boolean): boolean => {
    const el = document.getElementById(id);
    if (!el) return false;
    const y = el.getBoundingClientRect().top + window.scrollY - headerOffset();
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
    return true;
  };

  const start = (): void => {
    if (doScroll(true)) {
      // Corrective snaps after the page settles (expanded choosers, images,
      // async plan cards) so we end exactly on the section, not partway.
      setTimeout(() => doScroll(false), 450);
      setTimeout(() => doScroll(false), 950);
    } else if (tries++ < 30) {
      setTimeout(start, 100);
    }
  };

  start();
}
