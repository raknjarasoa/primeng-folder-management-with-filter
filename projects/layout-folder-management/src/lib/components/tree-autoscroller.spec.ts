import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TreeAutoscroller } from './tree-autoscroller';

describe('TreeAutoscroller', () => {
  let mockElement: any;

  beforeEach(() => {
    mockElement = {
      scrollTop: 100,
      getBoundingClientRect: () => ({
        top: 50,
        height: 400,
        bottom: 450,
      }) as DOMRect,
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly sets up options and retrieves viewport bounds', () => {
    const scroller = new TreeAutoscroller(() => mockElement, {
      viewportZonePx: 50,
      minSpeed: 5,
      maxSpeed: 50,
    });

    scroller.start(mockElement);
    expect(scroller.getViewportRect()).toEqual({
      top: 50,
      height: 400,
      bottom: 450,
    });
  });

  it('does not scroll when pointer is in the middle of viewport', () => {
    const tickSpy = vi.fn();
    const scroller = new TreeAutoscroller(() => mockElement, {
      viewportZonePx: 60,
      onScrollTick: tickSpy,
    });

    scroller.start(mockElement);
    scroller.move(200); // 200 is well away from top (0-60) and bottom (340-400)

    vi.advanceTimersByTime(100);
    expect(mockElement.scrollTop).toBe(100);
    expect(tickSpy).not.toHaveBeenCalled();
  });

  it('scrolled upwards and invokes tick when pointer is near top edge', () => {
    const tickSpy = vi.fn();
    const scroller = new TreeAutoscroller(() => mockElement, {
      viewportZonePx: 60,
      minSpeed: 10,
      maxSpeed: 40,
      onScrollTick: tickSpy,
    });

    scroller.start(mockElement);
    // Pointer is at 0 (exactly at the top edge) -> maximum speed (40px/frame)
    scroller.move(0);

    // Trigger one animation frame tick
    vi.runOnlyPendingTimers();

    expect(mockElement.scrollTop).toBe(60); // 100 - 40
    expect(tickSpy).toHaveBeenCalledWith(0);
  });

  it('scrolled downwards and invokes tick when pointer is near bottom edge', () => {
    const tickSpy = vi.fn();
    const scroller = new TreeAutoscroller(() => mockElement, {
      viewportZonePx: 60,
      minSpeed: 10,
      maxSpeed: 40,
      onScrollTick: tickSpy,
    });

    scroller.start(mockElement);
    // Pointer is at 400 (exactly at bottom edge) -> maximum speed (40px/frame)
    scroller.move(400);

    // Trigger one animation frame tick
    vi.runOnlyPendingTimers();

    expect(mockElement.scrollTop).toBe(140); // 100 + 40
    expect(tickSpy).toHaveBeenCalledWith(400);
  });

  it('stops autoscrolling and clears velocity when stop is called', () => {
    const tickSpy = vi.fn();
    const scroller = new TreeAutoscroller(() => mockElement, {
      viewportZonePx: 60,
      onScrollTick: tickSpy,
    });

    scroller.start(mockElement);
    scroller.move(10);
    scroller.stop();

    vi.runOnlyPendingTimers();
    expect(mockElement.scrollTop).toBe(100); // Unchanged
    expect(tickSpy).not.toHaveBeenCalled();
    expect(scroller.getViewportRect()).toBeNull();
  });
});
