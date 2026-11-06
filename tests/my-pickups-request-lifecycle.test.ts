import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { MyPickupsRequestLifecycle } from '../lib/myPickupsRequestLifecycle';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

describe('My Pickups request lifecycle', () => {
  it('allows pagination to restart immediately after refresh aborts it', () => {
    const lifecycle = new MyPickupsRequestLifecycle();
    const pagination = lifecycle.begin('pagination')!;
    const refresh = lifecycle.begin('refresh')!;
    const nextPagination = lifecycle.begin('pagination')!;

    assert.equal(pagination.controller.signal.aborted, true);
    assert.notEqual(nextPagination, pagination);
    assert.equal(lifecycle.isCurrent(refresh), true);
  });

  it('does not let an aborted pagination request clear newer pagination state', () => {
    const lifecycle = new MyPickupsRequestLifecycle();
    const first = lifecycle.begin('pagination')!;
    const refresh = lifecycle.begin('refresh')!;
    lifecycle.complete(refresh);
    const second = lifecycle.begin('pagination')!;

    lifecycle.complete(first);

    assert.equal(lifecycle.isCurrent(second), true);
    assert.equal(second.controller.signal.aborted, false);
  });

  it('rejects stale pagination responses after refresh', () => {
    const lifecycle = new MyPickupsRequestLifecycle();
    const pagination = lifecycle.begin('pagination')!;
    lifecycle.begin('refresh');

    assert.equal(lifecycle.isCurrent(pagination), false);
  });

  it('does not start pagination while refresh is active', () => {
    const lifecycle = new MyPickupsRequestLifecycle();
    const refresh = lifecycle.begin('refresh')!;

    assert.equal(lifecycle.begin('pagination'), null);

    lifecycle.complete(refresh);
    assert.notEqual(lifecycle.begin('pagination'), null);
  });

  it('rejects an older refresh after a newer refresh starts', () => {
    const lifecycle = new MyPickupsRequestLifecycle();
    const first = lifecycle.begin('refresh')!;
    const second = lifecycle.begin('refresh')!;

    assert.equal(first.controller.signal.aborted, true);
    assert.equal(lifecycle.isCurrent(first), false);
    assert.equal(lifecycle.isCurrent(second), true);
  });

  it('aborts both request types and rejects updates after disposal', async () => {
    const lifecycle = new MyPickupsRequestLifecycle();
    const pagination = lifecycle.begin('pagination')!;
    const refresh = lifecycle.begin('refresh')!;
    const pending = deferred();
    const staleCompletion = pending.promise.then(() => lifecycle.complete(pagination));

    lifecycle.dispose();
    const replacement = lifecycle.begin('pagination')!;
    pending.resolve();
    await staleCompletion;

    assert.equal(refresh.controller.signal.aborted, true);
    assert.equal(pagination.controller.signal.aborted, true);
    assert.equal(lifecycle.isCurrent(pagination), false);
    assert.equal(lifecycle.isCurrent(replacement), false);
    assert.equal(lifecycle.begin('pagination'), null);
  });

  it('allows a fresh coordinator to handle requests after cleanup', () => {
    const disposed = new MyPickupsRequestLifecycle();
    const stale = disposed.begin('refresh')!;
    disposed.dispose();

    const fresh = new MyPickupsRequestLifecycle();
    const current = fresh.begin('refresh')!;

    assert.equal(stale.controller.signal.aborted, true);
    assert.equal(disposed.isCurrent(stale), false);
    assert.equal(fresh.isCurrent(current), true);
  });
});
