export const BOTTOM_SCROLL_GUARD_PX = 80;

export function isNearScrollBottom(el: Element, thresholdPx = BOTTOM_SCROLL_GUARD_PX) {
  return el.scrollHeight - el.clientHeight - el.scrollTop <= thresholdPx;
}
