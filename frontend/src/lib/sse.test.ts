import { describe, expect, it, vi, afterEach } from 'vitest';
import type { SseEvent } from './sse';
import { SseParseError, createSseParser, isTerminalEvent, streamRunEvents } from './sse';

const runId = '00000030-0000-4000-8000-000000000030';

describe('createSseParser', () => {
  it('парсит события с sequence, heartbeat пропускает', () => {
    const events: [SseEvent, number][] = [];
    const parser = createSseParser((e, seq) => events.push([e, seq]));
    parser.feed(`: ping\n\nevent:run.started\nid:1\ndata:{"run_id":"${runId}"}\n\n`);
    parser.feed(`event:message.delta\nid:2\ndata:{"run_id":"${runId}","text":"При"}\n\n`);
    expect(events).toHaveLength(2);
    expect(events[0][0]).toEqual({ type: 'run.started', data: { run_id: runId } });
    expect(events[0][1]).toBe(1);
    expect(events[1][0]).toEqual({ type: 'message.delta', data: { run_id: runId, text: 'При' } });
  });

  it('v3 message.origin — нетерминальное событие с доверенным происхождением', () => {
    const events: SseEvent[] = [];
    const parser = createSseParser((e) => events.push(e));
    const msg = '00000031-0000-4000-8000-000000000031';
    parser.feed(`event:message.origin
data:{"run_id":"${runId}","message_id":"${msg}","origin":{"mode":"live","answered_by":"primary","completion":"complete"}}

`);
    expect(events[0]).toEqual({ type: 'message.origin', data: { run_id: runId, message_id: msg, origin: { mode: 'live', answered_by: 'primary', completion: 'complete' } } });
    expect(isTerminalEvent('message.origin')).toBe(false);
  });

  it('склеивает событие, разрезанное между чанками', () => {
    const events: SseEvent[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('event:run.cancelled\nid:7\ndata:{"run_id":"');
    parser.feed(`${runId}"}\n\n`);
    expect(events).toEqual([{ type: 'run.cancelled', data: { run_id: runId } }]);
  });

  it('невалидный JSON → SseParseError', () => {
    const parser = createSseParser(() => undefined);
    expect(() => parser.feed('event:run.started\nid:1\ndata:{oops}\n\n')).toThrow(SseParseError);
  });

  it('payload вне контракта → SseParseError', () => {
    const parser = createSseParser(() => undefined);
    expect(() =>
      parser.feed('event:run.started\nid:1\ndata:{"run_id":"not-uuid"}\n\n'),
    ).toThrow(/контракту/);
  });

  it('неизвестный тип события игнорируется', () => {
    const events: SseEvent[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('event:unknown.type\nid:1\ndata:{}\n\n');
    expect(events).toHaveLength(0);
  });

  it('терминальные события', () => {
    expect(isTerminalEvent('run.completed')).toBe(true);
    expect(isTerminalEvent('run.failed')).toBe(true);
    expect(isTerminalEvent('run.cancelled')).toBe(true);
    expect(isTerminalEvent('message.delta')).toBe(false);
  });
});

describe('streamRunEvents', () => {
  afterEach(() => vi.unstubAllGlobals());

  const streamOf = (text: string) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }),
      { status: 200 },
    );

  it('читает поток до конца и вызывает onClose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamOf(`event:run.completed\nid:3\ndata:{"run_id":"${runId}","message_id":"00000031-0000-4000-8000-000000000031"}\n\n`)));
    const onEvent = vi.fn();
    const onClose = vi.fn();
    await streamRunEvents(runId, { onEvent, onClose });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].type).toBe('run.completed');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('HTTP-ошибка → onError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const onError = vi.fn();
    await streamRunEvents(runId, { onEvent: () => undefined, onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(SseParseError);
  });

  it('abort → тихий onClose без onError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const onError = vi.fn();
    const onClose = vi.fn();
    await streamRunEvents(runId, { onEvent: () => undefined, onError, onClose });
    expect(onError).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
