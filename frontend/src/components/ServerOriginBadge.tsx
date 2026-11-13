import type { Origin } from '../lib/v3';
export function ServerOriginBadge({ origin }: { origin?: Origin }) {
 const label = !origin || origin.answered_by === 'unknown' ? 'Источник ответа не подтверждён' : origin.answered_by === 'primary' ? 'ИИ · основная модель' : origin.answered_by === 'secondary' ? 'ИИ · резервная модель' : origin.mode === 'mock' ? 'Демо · без LLM' : 'Fallback · без LLM';
 return <p className="mb-2 text-xs font-medium text-primary">{label}{origin?.completion === 'interrupted' ? ' · ответ прервался' : ''}{origin?.reason_code && origin.reason_code !== 'config_mock' ? ` · ${origin.reason_code}` : ''}</p>;
}
