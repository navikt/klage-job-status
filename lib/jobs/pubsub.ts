import { isJobEvent, type JobEvent, JobEventType, type JobKey } from '@common/common';
import type { GlideString, PubSubMsg } from '@valkey/valkey-glide';
import { formatJobKey } from '@/lib/jobs/key';
import { toStr } from '@/lib/jobs/valkey-utils';
import { parseJson } from '@/lib/json';
import { LOGS } from '@/lib/logging';
import { withSpan } from '@/lib/tracer';

export type JobEventListener = (event: JobEvent) => void;

/** Stops a listener registered via `subscribe`/`subscribeNamespace` from receiving further events. */
export type Unsubscribe = () => Promise<void>;

/**
 * The subset of `GlideClient`'s pub/sub API that `JobPubSub` depends on. Declared locally,
 * rather than depending on `GlideClient` directly, so tests can provide a plain mock object
 * without needing to cast it to the full (much larger) `GlideClient` type.
 */
export interface PubSubValkeyClient {
  subscribeLazy(channels: Iterable<GlideString>): Promise<void>;
  unsubscribeLazy(channels?: Iterable<GlideString> | null): Promise<void>;
  psubscribeLazy(patterns: Iterable<GlideString>): Promise<void>;
  punsubscribeLazy(patterns?: Iterable<GlideString> | null): Promise<void>;
  publish(message: GlideString, channel: GlideString): Promise<number>;
}

/**
 * Pattern for Valkey's "keyevent" notifications of expired keys (`__keyevent@<db>__:expired`,
 * where the message payload is the expired key itself). Matches any db index. Requires
 * `notify-keyspace-events` to include `Ex` on the server - see `Jobs#connect`.
 */
const EXPIRED_KEY_PATTERN = '__keyevent@*__:expired';

/**
 * Manages pub/sub channel and pattern subscriptions for job events, and dispatches
 * incoming Valkey pub/sub messages to the appropriate listeners.
 */
export class JobPubSub {
  #getClient: () => PubSubValkeyClient;

  #channelListeners = new Map<string, Set<JobEventListener>>();
  #patternListeners = new Map<string, Set<JobEventListener>>();

  constructor(getClient: () => PubSubValkeyClient) {
    this.#getClient = getClient;
  }

  /** Pass as the `callback` in `pubsubSubscriptions` when creating the `GlideClient`. */
  public onMessage = (msg: PubSubMsg) => {
    try {
      if (msg.pattern !== null && msg.pattern !== undefined && toStr(msg.pattern) === EXPIRED_KEY_PATTERN) {
        // The payload here is the expired key itself (e.g. "namespace:jobId"), not a JSON event.
        this.#onKeyExpired(toStr(msg.message));
        return;
      }

      const message = parseJson(toStr(msg.message));

      if (!isJobEvent(message)) {
        return;
      }

      if (msg.pattern !== null && msg.pattern !== undefined) {
        const listeners = this.#patternListeners.get(toStr(msg.pattern));

        for (const listener of listeners ?? []) {
          listener(message);
        }

        return;
      }

      const listeners = this.#channelListeners.get(toStr(msg.channel));

      for (const listener of listeners ?? []) {
        listener(message);
      }
    } catch (error) {
      LOGS.error('Error handling pub/sub message', 'valkey', {
        error: error instanceof Error ? error : 'Unknown error',
      });
    }
  };

  /**
   * A job's Valkey key expired (its TTL - `DELETE_JOB_AFTER_SECONDS` - elapsed) without any
   * explicit `delete` call. Synthesizes the same `DELETED` event an explicit delete would have
   * published, so dashboards subscribed to it (or to the namespace as a whole) update live
   * instead of only noticing on their next reload.
   */
  #onKeyExpired = (key: string) => {
    const [namespace, id] = key.split(':');

    if (namespace === undefined || id === undefined) {
      return;
    }

    const event: JobEvent = { eventType: JobEventType.DELETED, job: { id, namespace } };

    for (const listener of this.#channelListeners.get(key) ?? []) {
      listener(event);
    }

    for (const listener of this.#patternListeners.get(`${namespace}:*`) ?? []) {
      listener(event);
    }
  };

  /**
   * Subscribes to Valkey's expired-key notifications. Must be paired with enabling
   * `notify-keyspace-events` on the server (done once in `Jobs#connect`).
   */
  public async subscribeToExpiredKeys() {
    await this.#getClient().psubscribeLazy([EXPIRED_KEY_PATTERN]);
  }

  public async publish(event: JobEvent) {
    const channel = formatJobKey(event.job);
    await withSpan('pubsub.publish', { 'job.channel': channel, 'job.event_type': event.eventType }, () =>
      this.#getClient().publish(JSON.stringify(event), channel),
    );
  }

  public async subscribe(jobKey: JobKey, listener: JobEventListener): Promise<Unsubscribe> {
    const channel = formatJobKey(jobKey);
    const listeners = this.#channelListeners.get(channel) ?? new Set<JobEventListener>();
    const isNewChannel = listeners.size === 0;
    listeners.add(listener);
    this.#channelListeners.set(channel, listeners);

    if (isNewChannel) {
      await this.#getClient().subscribeLazy([channel]);
    }

    return () => this.unsubscribe(jobKey, listener);
  }

  public async unsubscribe(jobKey: JobKey, listener: JobEventListener) {
    const channel = formatJobKey(jobKey);
    const listeners = this.#channelListeners.get(channel);

    if (listeners === undefined) {
      return;
    }

    listeners.delete(listener);

    if (listeners.size === 0) {
      this.#channelListeners.delete(channel);
      await this.#getClient().unsubscribeLazy([channel]);
    }
  }

  public async subscribeNamespace(namespace: string, listener: JobEventListener): Promise<Unsubscribe> {
    const pattern = `${namespace}:*`;
    const listeners = this.#patternListeners.get(pattern) ?? new Set<JobEventListener>();
    const isNewPattern = listeners.size === 0;
    listeners.add(listener);
    this.#patternListeners.set(pattern, listeners);

    if (isNewPattern) {
      await this.#getClient().psubscribeLazy([pattern]);
    }

    return () => this.unsubscribeNamespace(namespace, listener);
  }

  /**
   * Removes `listener` from `namespace`'s pattern subscription. Only unsubscribes from Valkey
   * once every listener for that pattern has been removed, so other subscribers (e.g. a second
   * dashboard watching the same namespace) are unaffected.
   */
  public async unsubscribeNamespace(namespace: string, listener: JobEventListener) {
    const pattern = `${namespace}:*`;
    const listeners = this.#patternListeners.get(pattern);

    if (listeners === undefined) {
      return;
    }

    listeners.delete(listener);

    if (listeners.size === 0) {
      this.#patternListeners.delete(pattern);
      await this.#getClient().punsubscribeLazy([pattern]);
    }
  }
}
