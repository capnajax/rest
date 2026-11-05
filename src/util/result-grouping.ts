import { MutableRow } from '../data/orm/mutable-row.js';

export interface NormalizedResultGroupOptions {
  /**
   *  The maximum number of articles to return at a time. The default is `0`,
   *  which means no maximum, just send when the group delay has been reached,
   *  or, if no group delay, send all the articles when loaded.
   */
  maxGroupSize: number;
  /**
   *  The maximum amount to time in milliseconds to delay an article before
   *  sending it in a group. The default value is `10`. That is, an article
   *  may wait up to 10ms for more articles before being sent. Set to `0`
   *  to wait as long as necessary to either fill the queue or complete the load
   *  before sending anything. Ignored if `maxGroupSize` is set to `1` as all
   *  articles are sent immediately anyway.
   */
  maxGroupingDelayTime: number;
}

export type ResultGroupOptionsInput = Partial<NormalizedResultGroupOptions>;

export function normalizeResultGroupOptions(
  options: ResultGroupOptionsInput = {}
): NormalizedResultGroupOptions {
  return {
    maxGroupSize: options.maxGroupSize || 0,
    maxGroupingDelayTime:
      options.maxGroupSize === 1 ? 0 : options.maxGroupingDelayTime || 10,
  };
}

export class ResultGrouper<T extends MutableRow> {
  private groupStart: NodeJS.Timeout | null = null;
  private cb: (rows: T[]) => void;
  private maxGroupSize: number | undefined;
  private maxGroupingDelayTime: number | undefined;
  private queue: T[] = [];

  constructor(options: NormalizedResultGroupOptions, cb: (rows: T[]) => void) {
    this.maxGroupSize = options.maxGroupSize;
    this.maxGroupingDelayTime = options.maxGroupingDelayTime;
    this.cb = cb;
  }

  flush() {
    if (this.groupStart) {
      clearTimeout(this.groupStart);
      this.groupStart = null;
    }
    if (this.queue.length) {
      this.cb(this.queue);
      this.queue.length = 0;
    }
  }

  push(...rows: T[]): void {
    this.queue.push(...rows);
    if (!this.groupStart && this.maxGroupingDelayTime) {
      this.groupStart = setTimeout(() => {
        this.groupStart = null;
        this.flush();
      }, this.maxGroupingDelayTime);
    }
    if (this.maxGroupSize && this.queue.length >= this.maxGroupSize) {
      this.flush();
    }
  }
}
