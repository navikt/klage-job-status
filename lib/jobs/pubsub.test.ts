import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { type Job, type JobEvent, JobEventType, type JobKey, Status } from '@common/common';
import { type JobEventListener, JobPubSub, type PubSubValkeyClient } from '@/lib/jobs/pubsub';

/**
 * These tests exercise `JobPubSub` against a mock implementing its local `PubSubValkeyClient`
 * interface (no real Valkey needed), since `JobPubSub` only ever calls that small surface.
 */

type MockClient = {
  subscribeLazy: ReturnType<typeof mock>;
  unsubscribeLazy: ReturnType<typeof mock>;
  psubscribeLazy: ReturnType<typeof mock>;
  punsubscribeLazy: ReturnType<typeof mock>;
  publish: ReturnType<typeof mock>;
} & PubSubValkeyClient;

const createMockClient = (): MockClient => ({
  subscribeLazy: mock(() => Promise.resolve()),
  unsubscribeLazy: mock(() => Promise.resolve()),
  psubscribeLazy: mock(() => Promise.resolve()),
  punsubscribeLazy: mock(() => Promise.resolve()),
  publish: mock(() => Promise.resolve(1)),
});

const jobKey = (namespace: string, id: string): JobKey => ({ namespace, id });

const FIXED_TIMESTAMP = 1_700_000_000_000;

const makeJob = (namespace: string, id: string): Job => ({
  namespace,
  id,
  status: Status.RUNNING,
  ended: null,
  created: FIXED_TIMESTAMP,
  modified: FIXED_TIMESTAMP,
  timeout: 60,
});

let client: MockClient;
let pubsub: JobPubSub;

beforeEach(() => {
  client = createMockClient();
  pubsub = new JobPubSub(() => client);
});

describe('JobPubSub', () => {
  describe('subscribe', () => {
    test('subscribes to the channel on the first listener', async () => {
      await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});

      expect(client.subscribeLazy).toHaveBeenCalledTimes(1);
      expect(client.subscribeLazy).toHaveBeenCalledWith(['ns:job-1']);
    });

    test('does not re-subscribe to the channel for a second listener on the same key', async () => {
      await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});
      await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});

      expect(client.subscribeLazy).toHaveBeenCalledTimes(1);
    });

    test('subscribes separately to different channels', async () => {
      await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});
      await pubsub.subscribe(jobKey('ns', 'job-2'), () => {});

      expect(client.subscribeLazy).toHaveBeenCalledTimes(2);
      expect(client.subscribeLazy).toHaveBeenCalledWith(['ns:job-1']);
      expect(client.subscribeLazy).toHaveBeenCalledWith(['ns:job-2']);
    });
  });

  describe('subscribeNamespace', () => {
    test('subscribes to the namespace pattern on the first listener', async () => {
      await pubsub.subscribeNamespace('ns', () => {});

      expect(client.psubscribeLazy).toHaveBeenCalledTimes(1);
      expect(client.psubscribeLazy).toHaveBeenCalledWith(['ns:*']);
    });

    test('does not re-subscribe to the pattern for a second listener on the same namespace', async () => {
      await pubsub.subscribeNamespace('ns', () => {});
      await pubsub.subscribeNamespace('ns', () => {});

      expect(client.psubscribeLazy).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish', () => {
    test('publishes the event as JSON on the job channel', async () => {
      await pubsub.publish({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') });

      expect(client.publish).toHaveBeenCalledTimes(1);
      expect(client.publish).toHaveBeenCalledWith(
        JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }),
        'ns:job-1',
      );
      const [payload, channel] = client.publish.mock.calls[0] as [string, string];
      expect(channel).toBe('ns:job-1');
      expect(JSON.parse(payload)).toEqual({
        eventType: JobEventType.CREATED,
        job: makeJob('ns', 'job-1'),
      });
    });
  });

  describe('onMessage - channel dispatch', () => {
    test('dispatches a channel message to its listener', async () => {
      const received: JobEvent[] = [];
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => received.push(event));

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: null,
      });

      expect(received).toEqual([{ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }]);
    });

    test('does not dispatch to listeners on a different channel', async () => {
      const received: JobEvent[] = [];
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => received.push(event));

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-2') }),
        channel: 'ns:job-2',
        pattern: null,
      });

      expect(received).toEqual([]);
    });

    test('dispatches to every listener subscribed on the same channel', async () => {
      const receivedA: JobEvent[] = [];
      const receivedB: JobEvent[] = [];
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => receivedA.push(event));
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => receivedB.push(event));

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.UPDATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: null,
      });

      expect(receivedA).toHaveLength(1);
      expect(receivedB).toHaveLength(1);
    });

    test('ignores messages that are not valid job events', async () => {
      const received: JobEvent[] = [];
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => received.push(event));

      pubsub.onMessage({ message: JSON.stringify({ not: 'a job event' }), channel: 'ns:job-1', pattern: null });

      expect(received).toEqual([]);
    });

    test('does not throw on malformed JSON', () => {
      expect(() => pubsub.onMessage({ message: 'not json', channel: 'ns:job-1', pattern: null })).not.toThrow();
    });
  });

  describe('onMessage - pattern dispatch', () => {
    test('dispatches a pattern message to its listener', async () => {
      const received: JobEvent[] = [];
      await pubsub.subscribeNamespace('ns', (event) => received.push(event));

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: 'ns:*',
      });

      expect(received).toEqual([{ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }]);
    });

    test('a channel listener does not receive pattern-matched messages, and vice versa', async () => {
      const channelReceived: JobEvent[] = [];
      const patternReceived: JobEvent[] = [];
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => channelReceived.push(event));
      await pubsub.subscribeNamespace('ns', (event) => patternReceived.push(event));

      // A message delivered via pattern match (msg.pattern set) should only hit pattern listeners.
      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: 'ns:*',
      });

      expect(patternReceived).toHaveLength(1);
      expect(channelReceived).toHaveLength(0);
    });
  });

  describe('onMessage - expired key notifications', () => {
    const expiredKeyMessage = (key: string) => ({
      message: key,
      channel: '__keyevent@0__:expired',
      pattern: '__keyevent@*__:expired',
    });

    test('synthesizes a DELETED event for channel listeners on the expired key', async () => {
      const received: JobEvent[] = [];
      await pubsub.subscribe(jobKey('ns', 'job-1'), (event) => received.push(event));

      pubsub.onMessage(expiredKeyMessage('ns:job-1'));

      expect(received).toEqual([{ eventType: JobEventType.DELETED, job: { namespace: 'ns', id: 'job-1' } }]);
    });

    test('synthesizes a DELETED event for pattern listeners on the expired key namespace', async () => {
      const received: JobEvent[] = [];
      await pubsub.subscribeNamespace('ns', (event) => received.push(event));

      pubsub.onMessage(expiredKeyMessage('ns:job-1'));

      expect(received).toEqual([{ eventType: JobEventType.DELETED, job: { namespace: 'ns', id: 'job-1' } }]);
    });

    test('does nothing for a malformed expired key with no namespace separator', () => {
      expect(() => pubsub.onMessage(expiredKeyMessage('no-separator'))).not.toThrow();
    });
  });

  describe('subscribe - unsubscribe', () => {
    test('unsubscribes from the channel once the returned function is called', async () => {
      const unsubscribe = await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});

      await unsubscribe();

      expect(client.unsubscribeLazy).toHaveBeenCalledTimes(1);
      expect(client.unsubscribeLazy).toHaveBeenCalledWith(['ns:job-1']);
    });

    test('does not unsubscribe from the channel while another listener is still active', async () => {
      const unsubscribe = await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});
      await pubsub.subscribe(jobKey('ns', 'job-1'), () => {});

      await unsubscribe();

      expect(client.unsubscribeLazy).not.toHaveBeenCalled();
    });

    // Regression test: two independent SSE connections (e.g. two open browser tabs) can both
    // subscribe to the same job. Closing one of them must not silence updates for the other.
    test('unsubscribing one listener does not remove other listeners on the same channel', async () => {
      const receivedA: JobEvent[] = [];
      const receivedB: JobEvent[] = [];
      const listenerA: JobEventListener = (event) => receivedA.push(event);
      const listenerB: JobEventListener = (event) => receivedB.push(event);

      const unsubscribe = await pubsub.subscribe(jobKey('ns', 'job-1'), listenerA);
      await pubsub.subscribe(jobKey('ns', 'job-1'), listenerB);

      // Tab A disconnects and unsubscribes; tab B should still be listening.
      await unsubscribe();

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.UPDATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: null,
      });

      expect(receivedA).toHaveLength(0);
      expect(receivedB).toHaveLength(1);
      expect(client.unsubscribeLazy).not.toHaveBeenCalled();
    });
  });

  describe('subscribeNamespace - unsubscribe', () => {
    test('unsubscribes from the pattern once the returned function is called', async () => {
      const unsubscribe = await pubsub.subscribeNamespace('ns', () => {});

      await unsubscribe();

      expect(client.punsubscribeLazy).toHaveBeenCalledTimes(1);
      expect(client.punsubscribeLazy).toHaveBeenCalledWith(['ns:*']);
    });

    test('does not unsubscribe from the pattern while another listener is still active', async () => {
      const unsubscribe = await pubsub.subscribeNamespace('ns', () => {});
      await pubsub.subscribeNamespace('ns', () => {});

      await unsubscribe();

      expect(client.punsubscribeLazy).not.toHaveBeenCalled();
    });

    // Regression test: two dashboards watching the same namespace both register a pattern
    // listener. One disconnecting must not silence namespace-wide updates for the other.
    test('unsubscribing one listener does not remove other listeners on the same namespace', async () => {
      const receivedA: JobEvent[] = [];
      const receivedB: JobEvent[] = [];
      const listenerA: JobEventListener = (event) => receivedA.push(event);
      const listenerB: JobEventListener = (event) => receivedB.push(event);

      const unsubscribe = await pubsub.subscribeNamespace('ns', listenerA);
      await pubsub.subscribeNamespace('ns', listenerB);

      await unsubscribe();

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: 'ns:*',
      });

      expect(receivedA).toHaveLength(0);
      expect(receivedB).toHaveLength(1);
      expect(client.punsubscribeLazy).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    test('unsubscribes from the channel', async () => {
      const listener = () => {};
      await pubsub.subscribe(jobKey('ns', 'job-1'), listener);

      await pubsub.unsubscribe(jobKey('ns', 'job-1'), listener);

      expect(client.unsubscribeLazy).toHaveBeenCalledTimes(1);
      expect(client.unsubscribeLazy).toHaveBeenCalledWith(['ns:job-1']);
    });

    test('is a no-op when unsubscribing from a channel with no listeners', async () => {
      await pubsub.unsubscribe(jobKey('ns', 'never-subscribed'), () => {});

      expect(client.unsubscribeLazy).not.toHaveBeenCalled();
    });

    test('does not remove other listeners on the same channel', async () => {
      const receivedA: JobEvent[] = [];
      const receivedB: JobEvent[] = [];
      const listenerA: JobEventListener = (event) => receivedA.push(event);
      const listenerB: JobEventListener = (event) => receivedB.push(event);

      await pubsub.subscribe(jobKey('ns', 'job-1'), listenerA);
      await pubsub.subscribe(jobKey('ns', 'job-1'), listenerB);

      await pubsub.unsubscribe(jobKey('ns', 'job-1'), listenerA);

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.UPDATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: null,
      });

      expect(receivedA).toHaveLength(0);
      expect(receivedB).toHaveLength(1);
      expect(client.unsubscribeLazy).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribeNamespace', () => {
    test('unsubscribes from the pattern', async () => {
      const listener = () => {};
      await pubsub.subscribeNamespace('ns', listener);

      await pubsub.unsubscribeNamespace('ns', listener);

      expect(client.punsubscribeLazy).toHaveBeenCalledTimes(1);
      expect(client.punsubscribeLazy).toHaveBeenCalledWith(['ns:*']);
    });

    test('is a no-op when unsubscribing from a namespace with no listeners', async () => {
      await pubsub.unsubscribeNamespace('never-subscribed', () => {});

      expect(client.punsubscribeLazy).not.toHaveBeenCalled();
    });

    test('does not remove other listeners on the same namespace', async () => {
      const receivedA: JobEvent[] = [];
      const receivedB: JobEvent[] = [];
      const listenerA: JobEventListener = (event) => receivedA.push(event);
      const listenerB: JobEventListener = (event) => receivedB.push(event);

      await pubsub.subscribeNamespace('ns', listenerA);
      await pubsub.subscribeNamespace('ns', listenerB);

      await pubsub.unsubscribeNamespace('ns', listenerA);

      pubsub.onMessage({
        message: JSON.stringify({ eventType: JobEventType.CREATED, job: makeJob('ns', 'job-1') }),
        channel: 'ns:job-1',
        pattern: 'ns:*',
      });

      expect(receivedA).toHaveLength(0);
      expect(receivedB).toHaveLength(1);
      expect(client.punsubscribeLazy).not.toHaveBeenCalled();
    });
  });
});
