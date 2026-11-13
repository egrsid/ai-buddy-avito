import { Loader2 } from 'lucide-react';
import type { Action } from '../fixtures/all-states';
import { Card, Button } from './ui';
import { ActionStatusBadge } from './StatusBadge';

// Карточка действия: точный preview от сервера, явный confirm/cancel.
// «Да» в чате ничего не исполняет — только кнопка конкретного action_id.
// unknown/expired/failed не выглядят как успех; retry — новый action, не повтор.

function previewLines(action: Action): [string, string][] {
  if (action.type === 'create_access_request') {
    const p = action.preview as {
      resource_id: string;
      requested_role: string;
      reason: string;
      recipient_id: string;
    };
    return [
      ['Ресурс', p.resource_id],
      ['Запрашиваемая роль', p.requested_role],
      ['Основание', p.reason],
      ['Согласующий', p.recipient_id.slice(0, 13) + '…'],
    ];
  }
  const p = action.preview as {
    question: string;
    diagnostic_snapshot: { goal: { title: string }; step: { title: string } };
    recipient_id: string;
  };
  return [
    ['Получатель', p.recipient_id.slice(0, 13) + '…'],
    ['Цель / шаг', `${p.diagnostic_snapshot.goal.title} / ${p.diagnostic_snapshot.step.title}`],
    ['Вопрос', p.question],
  ];
}

export function ActionCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: Action;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
}) {
  const title =
    action.type === 'create_access_request' ? 'Заявка на доступ' : 'Передача вопроса наставнику';

  return (
    <Card className="border-primary/30" aria-label={`Действие: ${title}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <ActionStatusBadge status={action.status} />
      </div>

      <dl className="mb-3 space-y-1.5 rounded-xl bg-surface-muted p-3 text-sm">
        {previewLines(action).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-36 shrink-0 text-text-secondary">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {action.status === 'pending_confirmation' && (
        <>
          <p className="mb-3 text-xs text-text-secondary">
            Предпросмотр сформирован сервером и неизменяем. Действует до {action.expires_at} (серверное время).
          </p>
          <div className="flex gap-2">
            <Button onClick={() => onConfirm?.(action.id)}>Подтвердить</Button>
            <Button variant="ghost" onClick={() => onCancel?.(action.id)}>
              Отмена
            </Button>
          </div>
        </>
      )}

      {action.status === 'executing' && (
        <p className="flex items-center gap-2 text-sm text-text-secondary" role="status">
          <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
          Выполняется, результат появится автоматически…
        </p>
      )}

      {action.status === 'succeeded' && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-success" role="status">
          {action.type === 'create_access_request'
            ? 'Заявка создана. Это не выдача доступа: факт подтвердит отдельная IAM-проверка.'
            : 'Вопрос передан наставнику. Ответ придёт в обращение.'}
        </p>
      )}

      {action.status === 'failed' && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">
          Действие не выполнено ({action.error_code}). Повтор — только новое предложение с новым подтверждением.
        </p>
      )}

      {action.status === 'unknown' && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700" role="alert">
          Результат уточняется ({action.error_code}). Не повторяйте отправку, пока идёт сверка —
          дубликат исключён ключом операции.
        </p>
      )}

      {action.status === 'expired' && (
        <p className="text-sm text-text-secondary">
          Время подтверждения истекло. Запросите действие заново, если оно ещё нужно.
        </p>
      )}

      {action.status === 'cancelled' && (
        <p className="text-sm text-text-secondary">Действие отменено и не выполнялось.</p>
      )}
    </Card>
  );
}
