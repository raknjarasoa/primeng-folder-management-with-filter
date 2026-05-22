/**
 * Configuration options for the TreeAutoscroller.
 */
export interface AutoscrollerOptions {
  /**
   * Height in pixels at the top and bottom of the viewport where autoscrolling is triggered.
   * Defaults to 60px.
   */
  viewportZonePx?: number;

  /**
   * The minimum scrolling speed in pixels per frame when entering the trigger zone.
   * Defaults to 3px/frame.
   */
  minSpeed?: number;

  /**
   * The maximum scrolling speed in pixels per frame when close to the viewport edge.
   * Defaults to 40px/frame.
   */
  maxSpeed?: number;

  /**
   * Optional callback triggered on every scroll tick.
   * Receives the last known pointer Y position (relative to the viewport) to re-evaluate drop zones.
   */
  onScrollTick?: (pointerY: number) => void;
}

/**
 * Handles smooth drag autoscrolling for the folder tree viewport.
 * Automatically scrolls when the drag cursor enters the top or bottom zones,
 * dynamically adjusting velocity based on proximity to the edge.
 */
export class TreeAutoscroller {
  private rafId: number | null = null;
  private velocity = 0;
  private lastPointerY = 0;
  private viewportRect: DOMRect | null = null;

  private readonly zonePx: number;
  private readonly minSpeed: number;
  private readonly maxSpeed: number;
  private readonly onScrollTick?: (pointerY: number) => void;

  /**
   * Creates a new instance of TreeAutoscroller.
   * 
   * @param viewportResolver A function that resolves the viewport element to scroll.
   * @param options Configuration options for scroll behavior and callbacks.
   */
  constructor(
    private readonly viewportResolver: () => HTMLElement | null | undefined,
    options: AutoscrollerOptions = {},
  ) {
    this.zonePx = options.viewportZonePx ?? 60;
    this.minSpeed = options.minSpeed ?? 3;
    this.maxSpeed = options.maxSpeed ?? 40;
    this.onScrollTick = options.onScrollTick;
  }

  /**
   * Starts tracking the autoscroll container's geometry.
   * Should be invoked when a drag operation starts.
   * 
   * @param viewportElement The HTML element acting as the scrollable viewport.
   */
  start(viewportElement: HTMLElement): void {
    this.viewportRect = viewportElement.getBoundingClientRect();
  }

  /**
   * Updates the scroll velocity based on the pointer's vertical position.
   * Should be invoked on every drag movement event.
   * 
   * @param pointerYInViewport The vertical coordinate of the pointer relative to the viewport's top edge.
   */
  move(pointerYInViewport: number): void {
    const rect = this.viewportRect;
    if (!rect) return;

    this.lastPointerY = pointerYInViewport;

    // Proximity logic: scroll speed ramps up as the pointer gets closer to the extreme edge
    const distFromTop = pointerYInViewport;
    const distFromBottom = rect.height - pointerYInViewport;
    let velocity = 0;

    if (distFromTop < this.zonePx) {
      velocity = -this.scrollSpeedFor(distFromTop);
    } else if (distFromBottom < this.zonePx) {
      velocity = this.scrollSpeedFor(distFromBottom);
    }

    this.setVelocity(velocity);
  }

  /**
   * Stops any active autoscroll animation frames and resets tracking state.
   * Should be invoked when the drag operation completes, is cancelled, or the component is destroyed.
   */
  stop(): void {
    this.stopRaf();
    this.velocity = 0;
    this.viewportRect = null;
  }

  /**
   * Gets the cached bounding client rectangle of the viewport.
   * 
   * @returns The DOMRect representing the viewport container, or null if not currently active.
   */
  getViewportRect(): DOMRect | null {
    return this.viewportRect;
  }

  /**
   * Gets the last tracked pointer Y coordinate.
   * 
   * @returns The last known pointer Y position relative to the viewport's top edge.
   */
  getLastPointerY(): number {
    return this.lastPointerY;
  }

  /**
   * Calculates the scroll speed using linear interpolation based on proximity to the edge.
   * 
   * @param distToEdge Distance in pixels from the pointer to the nearest active scroll boundary.
   * @returns The calculated speed in pixels per animation frame.
   */
  private scrollSpeedFor(distToEdge: number): number {
    const clamped = Math.max(0, Math.min(this.zonePx, distToEdge));
    // Proximity factor: 0 at outer edge of trigger zone, 1 right at the viewport edge
    const proximity = 1 - clamped / this.zonePx;
    return this.minSpeed + (this.maxSpeed - this.minSpeed) * proximity;
  }

  /**
   * Schedules or updates the requestAnimationFrame loop based on velocity changes.
   * 
   * @param targetVelocity The desired velocity to apply on each animation frame.
   */
  private setVelocity(targetVelocity: number): void {
    this.velocity = targetVelocity;
    if (targetVelocity === 0) {
      this.stopRaf();
    } else if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.tick());
    }
  }

  /**
   * The animation frame tick callback.
   * Scrolls the viewport container, notifies subscribers via onScrollTick,
   * and schedules the next frame if scrolling remains active.
   */
  private tick(): void {
    this.rafId = null;
    const element = this.viewportResolver();
    if (!element || this.velocity === 0) return;

    const currentOffset = element.scrollTop;
    const nextOffset = Math.max(0, currentOffset + this.velocity);
    element.scrollTop = nextOffset;

    if (this.onScrollTick) {
      this.onScrollTick(this.lastPointerY);
    }

    // Continue the autoscroll animation frame loop
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  /**
   * Cancels any pending requestAnimationFrame and clears the active frame ID.
   */
  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
