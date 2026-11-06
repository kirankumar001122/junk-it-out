export type PickupRequestKind = 'refresh' | 'pagination';

export type PickupRequestHandle = {
  kind: PickupRequestKind;
  controller: AbortController;
  generation: number;
};

export class MyPickupsRequestLifecycle {
  private generation = 0;
  private refresh: PickupRequestHandle | null = null;
  private pagination: PickupRequestHandle | null = null;
  private mounted = true;

  begin(kind: PickupRequestKind): PickupRequestHandle | null {
    if (kind === 'pagination' && (this.refresh || this.pagination)) return null;

    const handle: PickupRequestHandle = {
      kind,
      controller: new AbortController(),
      generation: kind === 'refresh' ? this.generation + 1 : this.generation,
    };

    if (kind === 'refresh') {
      this.generation = handle.generation;
      this.pagination?.controller.abort();
      this.pagination = null;
      this.refresh?.controller.abort();
      this.refresh = handle;
    } else {
      this.pagination = handle;
    }

    return handle;
  }

  isCurrent(handle: PickupRequestHandle): boolean {
    if (!this.mounted || handle.generation !== this.generation) return false;
    return handle.kind === 'refresh'
      ? this.refresh === handle
      : this.pagination === handle;
  }

  complete(handle: PickupRequestHandle): void {
    if (handle.kind === 'refresh') {
      if (this.refresh === handle) this.refresh = null;
    } else if (this.pagination === handle) {
      this.pagination = null;
    }
  }

  dispose(): void {
    this.mounted = false;
    this.refresh?.controller.abort();
    this.pagination?.controller.abort();
    this.refresh = null;
    this.pagination = null;
  }
}
