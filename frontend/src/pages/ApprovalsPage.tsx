import { useState } from 'react';
import { accessRequests } from '../fixtures/all-states';
import type { AccessRequest } from '../fixtures/all-states';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { RequestStatusBadge } from '../components/StatusBadge';

// Минимальный экран scoped approver: approve/reject с обязательным основанием.
// Решение не объединено с интерфейсом intern; пометка mock обязательна.

export function ApprovalsPage({ view }: { view: ViewState }) {
  const result = useMockData<AccessRequest[]>(accessRequests, [], view);
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  return (
    <>
      <PageHeader title="Согласования" subtitle="Назначенные вам ресурсы · решение имитирует mock-сервис" />
      {result.state === 'loading' && <Card><LoadingState /></Card>}
      {result.state === 'error' && <ErrorState onRetry={() => window.location.reload()} />}
      {result.state === 'empty' && (
        <EmptyState title="Нет заявок на согласование" message="Новые заявки назначенных ресурсов появятся здесь." />
      )}
      {result.state === 'data' && result.data && (
        <ul className="space-y-3">
          {result.data
            .filter((r) => r.status === 'submitted' || decisions[r.id])
            .map((r) => {
              const decided = decisions[r.id];
              return (
                <li key={r.id}>
                  <Card>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{r.resource_id}</p>
                        <p className="text-xs text-text-secondary">роль {r.requested_role} · версия {r.version}</p>
                      </div>
                      <RequestStatusBadge status={decided ?? r.status} />
                    </div>
                    <p className="mb-3 text-sm text-text-secondary">Основание стажёра: {r.reason}</p>
                    {!decided ? (
                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium">Ваше основание решения</span>
                          <textarea
                            value={reasons[r.id] ?? ''}
                            onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                            rows={2}
                            maxLength={1000}
                            className="w-full rounded-xl border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                            placeholder="Например: назначение подтверждено"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button
                            disabled={!reasons[r.id]?.trim()}
                            onClick={() => setDecisions({ ...decisions, [r.id]: 'approved' })}
                          >
                            Одобрить
                          </Button>
                          <Button
                            variant="danger"
                            disabled={!reasons[r.id]?.trim()}
                            onClick={() => setDecisions({ ...decisions, [r.id]: 'rejected' })}
                          >
                            Отклонить
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-secondary">
                        Решение сохранено. Одобрение не выдаёт доступ автоматически — grant подтверждает IAM.
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
        </ul>
      )}
    </>
  );
}
