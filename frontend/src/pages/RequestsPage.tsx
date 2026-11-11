import { useState } from 'react';
import { accessRequests } from '../fixtures/all-states';
import type { AccessRequest } from '../fixtures/all-states';
import type { ViewState } from '../lib/useMockData';
import { useMockData } from '../lib/useMockData';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { GrantStateBadge, RequestStatusBadge, SyncStatusNote } from '../components/StatusBadge';

export function RequestsPage({ view }: { view: ViewState }) {
  const result = useMockData<AccessRequest[]>(accessRequests, [], view);

  return (
    <>
      <PageHeader
        title="Мои заявки"
        subtitle="Созданная заявка не означает выданный доступ — факт подтверждает IAM-проверка"
      />
      {result.state === 'loading' && <Card><LoadingState /></Card>}
      {result.state === 'error' && <ErrorState onRetry={() => window.location.reload()} />}
      {result.state === 'empty' && (
        <EmptyState
          title="Заявок пока нет"
          message="Когда вы подтвердите отправку заявки на доступ, она появится здесь со статусом."
        />
      )}
      {result.state === 'data' && result.data && (
        <ul className="space-y-3">
          {result.data.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.resource_id}</p>
                    <p className="text-xs text-text-secondary">
                      роль {r.requested_role} · версия {r.version} · обновлена {r.updated_at}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RequestStatusBadge status={r.status} />
                    <GrantStateBadge state={r.grant_state} />
                  </div>
                </div>
                <p className="mt-2 text-sm text-text-secondary">Основание: {r.reason}</p>
                <SyncStatusNote sync={r.sync_status} />
                {r.status === 'approved' && r.grant_state !== 'present' && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Заявка одобрена, но доступ ещё не подтверждён проверкой IAM.
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
