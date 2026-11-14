import { useState } from 'react';
import type { AccessRequest } from '../fixtures/all-states';
import { decideAccessRequest, listAccessRequests } from '../lib/endpoints';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { GrantStateBadge, RequestStatusBadge, SyncStatusNote } from '../components/StatusBadge';

// RP-FE-02: live-варианты заявок и согласований.
// GET /access-requests один на обе роли: intern — свои, approver — назначенные.

function RequestCard({ r }: { r: AccessRequest }) {
  return (
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
      {r.status === 'approved' && r.grant_state === 'present' && (
        <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-xs text-success">
          Доступ выдан — IAM подтвердил, шаг «Проверить доступ» засчитан автоматически.
        </p>
      )}
      {r.status === 'approved' && r.grant_state !== 'present' && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Заявка одобрена, но доступ ещё не подтверждён проверкой IAM.
        </p>
      )}
    </Card>
  );
}

// Что произошло после решения: одобрение засчитывает шаг только вместе с подтверждением IAM.
function DecisionNote({ r }: { r: AccessRequest }) {
  if (r.status === 'approved' && r.grant_state === 'present') {
    return <p className="text-sm text-success">Одобрено. Доступ выдан (IAM подтвердил), шаг стажёра засчитан.</p>;
  }
  if (r.status === 'approved') {
    return <p className="text-sm text-amber-700">Одобрено, но IAM ещё не подтвердил доступ — шаг стажёра пока не засчитан.</p>;
  }
  return <p className="text-sm text-text-secondary">Отклонено. Стажёр увидит решение в «Мои заявки».</p>;
}

export function LiveRequestsPage() {
  const requests = useLiveData(() => listAccessRequests(), [], []);
  return (
    <>
      <PageHeader
        title="Мои заявки"
        subtitle="Созданная заявка не означает выданный доступ — факт подтверждает IAM-проверка"
      />
      {requests.state === 'loading' && <Card><LoadingState /></Card>}
      {requests.state === 'error' && <ErrorState message={userMessage(requests.error)} onRetry={requests.refetch} />}
      {requests.state === 'empty' && (
        <EmptyState
          title="Заявок пока нет"
          message="Когда вы подтвердите отправку заявки на доступ, она появится здесь со статусом."
        />
      )}
      {requests.state === 'data' && requests.data && (
        <ul className="space-y-3">
          {requests.data.map((r) => (
            <li key={r.id}><RequestCard r={r} /></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function LiveApprovalsPage() {
  const requests = useLiveData(() => listAccessRequests(), [], []);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const decide = async (r: AccessRequest, decision: 'approved' | 'rejected') => {
    setBusy(r.id);
    setNotice(null);
    try {
      await decideAccessRequest(r.id, {
        decision,
        reason: reasons[r.id] ?? '',
        expected_version: r.version,
      });
      requests.refetch();
    } catch (e) {
      setNotice(userMessage(e, 'Решение не сохранено.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Согласования" subtitle="Назначенные вам ресурсы · live API" />
      {requests.state === 'loading' && <Card><LoadingState /></Card>}
      {requests.state === 'error' && <ErrorState message={userMessage(requests.error)} onRetry={requests.refetch} />}
      {requests.state === 'empty' && (
        <EmptyState title="Нет заявок на согласование" message="Новые заявки назначенных ресурсов появятся здесь." />
      )}
      {requests.state === 'data' && requests.data && (
        <>
          {notice && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{notice}</p>}
          <ul className="space-y-3">
            {requests.data.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.resource_id}</p>
                      <p className="text-xs text-text-secondary">роль {r.requested_role} · версия {r.version}</p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </div>
                  <p className="mb-3 text-sm text-text-secondary">Основание стажёра: {r.reason}</p>
                  {r.status === 'submitted' ? (
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
                        <Button disabled={!reasons[r.id]?.trim() || busy === r.id} onClick={() => decide(r, 'approved')}>
                          Одобрить
                        </Button>
                        <Button
                          variant="danger"
                          disabled={!reasons[r.id]?.trim() || busy === r.id}
                          onClick={() => decide(r, 'rejected')}
                        >
                          Отклонить
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <DecisionNote r={r} />
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
