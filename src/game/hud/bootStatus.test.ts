import { describe, expect, it, vi } from 'vitest';
import { createBootStatus } from './bootStatus';

describe('boot status', () => {
  it('starts in loading and acknowledges a touch without changing phase', () => {
    const status = createBootStatus();

    expect(status.phase()).toBe('loading');
    expect(status.acknowledgeTouch()).toBe(true);
    expect(status.phase()).toBe('loading');
  });

  it('moves from loading to ready and ignores a late failure', () => {
    const status = createBootStatus();

    expect(status.markReady()).toBe(true);
    expect(status.phase()).toBe('ready');
    expect(status.markFailed()).toBe(false);
    expect(status.phase()).toBe('ready');
    expect(status.acknowledgeTouch()).toBe(false);
  });

  it('moves from loading to failed and exposes one retry request', () => {
    const onRetry = vi.fn();
    const status = createBootStatus(onRetry);

    expect(status.markFailed()).toBe(true);
    expect(status.phase()).toBe('failed');
    expect(status.acknowledgeTouch()).toBe(true);

    expect(status.retry()).toBe(true);
    expect(status.phase()).toBe('retrying');
    expect(status.retry()).toBe(false);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not retry while loading or after a ready boot', () => {
    const onRetry = vi.fn();
    const status = createBootStatus(onRetry);

    expect(status.retry()).toBe(false);
    expect(onRetry).not.toHaveBeenCalled();

    status.markReady();
    expect(status.retry()).toBe(false);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not let a late ready result revive a failed boot', () => {
    const status = createBootStatus();

    status.markFailed();
    expect(status.markReady()).toBe(false);
    expect(status.phase()).toBe('failed');
  });
});
