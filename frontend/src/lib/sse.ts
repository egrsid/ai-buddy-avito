import { z } from 'zod';
import {
  ActionProposedData,
  MessageDeltaData,
  MessageSourcesData,
  RunCancelledData,
  RunCompletedData,
  RunFailedData,
  RunStartedData,
} from '../contracts/public';

// RP-FE-02: SSE-поток run (GET /runs/{id}/events).
// Envelope: event:<type>, id:<sequence>, data:<однострочный JSON>, пустая строка.
// Heartbeat `: ping` — комментарий, пропускаем. Терминальное событие ровно одно.

export type SseEvent =
  | { type: 'run.started'; data: z.infer<typeof RunStartedData> }
  | { type: 'message.delta'; data: z.infer<typeof MessageDeltaData> }
  | { type: 'message.sources'; data: z.infer<typeof MessageSourcesData> }
  | { type: 'action.proposed'; data: z.infer<typeof ActionProposedData> }
  | { type: 'run.completed'; data: z.infer<typeof RunCompletedData> }
  | { type: 'run.failed'; data: z.infer<typeof RunFailedData> }
  | { type: 'run.cancelled'; data: z.infer<typeof RunCancelledData> };

const dataSchemas = {
  'run.started': RunStartedData,
  'message.delta': MessageDeltaData,
  'message.sources': MessageSourcesData,
  'action.proposed': ActionProposedData,
  'run.completed': RunCompletedData,
  'run.failed': RunFailedData,
  'run.cancelled': RunCancelledData,
} as const;

const terminalTypes = new Set(['run.completed', 'run.failed', 'run.cancelled']);

export class SseParseError extends Error {}

// Инкрементальный парсер: скармливаем текстовые чанки, получаем события.
export function createSseParser(onEvent: (event: SseEvent, sequence: number) => void) {
  let buffer = '';
  let eventType = '';
  let dataLine = '';
  let sequence = 0;

  const dispatch = () => {
    const type = eventType as keyof typeof dataSchemas;
    eventType = '';
    const raw = dataLine;
    dataLine = '';
    if (!type || !(type in dataSchemas)) return;
    const schema = dataSchemas[type];
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new SseParseError(`SSE ${type}: невалидный JSON`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new SseParseError(`SSE ${type}: payload не соответствует контракту`);
    }
    onEvent({ type, data: parsed.data } as SseEvent, sequence);
  };

  return {
    feed(chunk: string): void {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line === '') {
          dispatch();
        } else if (line.startsWith(':')) {
          // heartbeat — комментарий без sequence
        } else if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('id:')) {
          sequence = Number(line.slice(3).trim());
        } else if (line.startsWith('data:')) {
          dataLine = line.slice(5).trimStart();
        }
      }
    },
    isTerminal(type: string): boolean {
      return terminalTypes.has(type);
    },
  };
}

export interface RunStreamHandlers {
  onEvent: (event: SseEvent, sequence: number) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  signal?: AbortSignal;
}

// GET /runs/{id}/events: cookie шлёт браузер, CSRF для GET не нужен.
// Читаем через fetch+ReadableStream (EventSource не умеет credentials/заголовки гибко).
export async function streamRunEvents(runId: string, handlers: RunStreamHandlers): Promise<void> {
  const parser = createSseParser(handlers.onEvent);
  try {
    const response = await fetch(`/api/v2/runs/${runId}/events`, {
      headers: { Accept: 'text/event-stream' },
      credentials: 'same-origin',
      signal: handlers.signal,
    });
    if (!response.ok || !response.body) {
      throw new SseParseError(`SSE недоступен: HTTP ${response.status}`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parser.feed(value);
    }
    handlers.onClose?.();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      handlers.onClose?.();
      return;
    }
    handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
  }
}

export const isTerminalEvent = (type: string) => terminalTypes.has(type);
