import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock,
  HelpCircle,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  ActionStatus,
  BlockerStatus,
  CandidateState,
  CheckStatus,
  EnrichmentStatus,
  EscalationStatus,
  GrantState,
  State,
} from '../contracts/common';
import type { AccessRequestStatus, SyncStatus } from '../contracts/common';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'muted';

const toneClasses: Record<Tone, string> = {
  success: 'bg-green-50 text-success border-success/30',
  warning: 'bg-amber-50 text-amber-700 border-warning/50',
  error: 'bg-red-50 text-error border-error/30',
  info: 'bg-primary-light text-primary border-primary/30',
  muted: 'bg-surface-muted text-text-secondary border-border',
};

function Badge({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </span>
  );
}

const stateMap: Record<State, { tone: Tone; icon: ReactNode; label: string }> = {
  unverified: { tone: 'muted', icon: <Circle size={14} />, label: 'Не проверено' },
  ready: { tone: 'info', icon: <CircleDashed size={14} />, label: 'Можно выполнять' },
  blocked: { tone: 'error', icon: <AlertTriangle size={14} />, label: 'Есть препятствие' },
  waiting_external: { tone: 'warning', icon: <Clock size={14} />, label: 'Ожидаем' },
  verified: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Проверено' },
};

export function StateBadge({ state }: { state: State }) {
  const s = stateMap[state];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const checkMap: Record<CheckStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  queued: { tone: 'muted', icon: <Clock size={14} />, label: 'В очереди' },
  running: { tone: 'info', icon: <Loader2 size={14} className="animate-spin" />, label: 'Выполняется' },
  passed: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Успешно' },
  failed: { tone: 'error', icon: <XCircle size={14} />, label: 'Ошибка' },
  unavailable: { tone: 'warning', icon: <HelpCircle size={14} />, label: 'Сервис недоступен' },
};

export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  const s = checkMap[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const actionMap: Record<ActionStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  pending_confirmation: { tone: 'warning', icon: <Clock size={14} />, label: 'Ждёт подтверждения' },
  executing: { tone: 'info', icon: <Loader2 size={14} className="animate-spin" />, label: 'Выполняется' },
  succeeded: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Выполнено' },
  failed: { tone: 'error', icon: <XCircle size={14} />, label: 'Ошибка выполнения' },
  unknown: { tone: 'warning', icon: <HelpCircle size={14} />, label: 'Статус уточняется' },
  cancelled: { tone: 'muted', icon: <XCircle size={14} />, label: 'Отменено' },
  expired: { tone: 'muted', icon: <Clock size={14} />, label: 'Истекло' },
};

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  const s = actionMap[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const requestMap: Record<AccessRequestStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  submitted: { tone: 'info', icon: <Send size={14} />, label: 'Отправлена' },
  approved: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Одобрена' },
  rejected: { tone: 'error', icon: <XCircle size={14} />, label: 'Отклонена' },
};

export function RequestStatusBadge({ status }: { status: AccessRequestStatus }) {
  const s = requestMap[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const grantMap: Record<GrantState, { tone: Tone; icon: ReactNode; label: string }> = {
  absent: { tone: 'muted', icon: <Circle size={14} />, label: 'Доступа нет' },
  pending: { tone: 'warning', icon: <Clock size={14} />, label: 'Доступ выдаётся' },
  present: { tone: 'success', icon: <ShieldCheck size={14} />, label: 'Подтверждён IAM' },
  unknown: { tone: 'warning', icon: <HelpCircle size={14} />, label: 'Не удалось проверить' },
};

export function GrantStateBadge({ state }: { state: GrantState }) {
  const s = grantMap[state];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

export function SyncStatusNote({ sync }: { sync: SyncStatus }) {
  if (sync === 'ok') return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700" role="status">
      <AlertTriangle size={14} aria-hidden />
      Не удалось обновить статус — показано последнее сохранённое состояние.
    </p>
  );
}

const candidateMap: Record<CandidateState, { tone: Tone; icon: ReactNode; label: string }> = {
  proposed: { tone: 'info', icon: <CircleDashed size={14} />, label: 'Предложен' },
  under_review: { tone: 'warning', icon: <Clock size={14} />, label: 'На рассмотрении' },
  accepted: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Принят' },
  rejected: { tone: 'error', icon: <XCircle size={14} />, label: 'Отклонён' },
  resolved: { tone: 'success', icon: <ShieldCheck size={14} />, label: 'Решён' },
};

export function CandidateStateBadge({ state }: { state: CandidateState }) {
  const s = candidateMap[state];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const enrichmentMap: Record<EnrichmentStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  pending: { tone: 'warning', icon: <Loader2 size={14} className="animate-spin" />, label: 'Описание формируется' },
  failed: { tone: 'error', icon: <AlertTriangle size={14} />, label: 'Ошибка обогащения' },
  completed: { tone: 'muted', icon: <CheckCircle2 size={14} />, label: 'Описание готово' },
};

export function EnrichmentBadge({ status }: { status: EnrichmentStatus }) {
  const s = enrichmentMap[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const escalationMap: Record<EscalationStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  open: { tone: 'warning', icon: <Clock size={14} />, label: 'Открыто' },
  resolved: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Закрыто' },
};

export function EscalationStatusBadge({ status }: { status: EscalationStatus }) {
  const s = escalationMap[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

const blockerMap: Record<BlockerStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  open: { tone: 'error', icon: <AlertTriangle size={14} />, label: 'Активен' },
  resolved: { tone: 'success', icon: <CheckCircle2 size={14} />, label: 'Устранён' },
};

export function BlockerStatusBadge({ status }: { status: BlockerStatus }) {
  const s = blockerMap[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}
