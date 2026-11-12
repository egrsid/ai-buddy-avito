import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
import type { AccessRequestStatus } from '../contracts/common';
import {
  ActionStatusBadge,
  BlockerStatusBadge,
  CandidateStateBadge,
  CheckStatusBadge,
  EnrichmentBadge,
  EscalationStatusBadge,
  GrantStateBadge,
  RequestStatusBadge,
  StateBadge,
  SyncStatusNote,
} from './StatusBadge';

describe('StateBadge', () => {
  it.each([
    ['unverified', 'Не проверено'],
    ['ready', 'Можно выполнять'],
    ['blocked', 'Есть препятствие'],
    ['waiting_external', 'Ожидаем'],
    ['verified', 'Проверено'],
  ] as [State, string][])('%s → %s', (state, label) => {
    render(<StateBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('CheckStatusBadge', () => {
  it.each([
    ['queued', 'В очереди'],
    ['running', 'Выполняется'],
    ['passed', 'Успешно'],
    ['failed', 'Ошибка'],
    ['unavailable', 'Сервис недоступен'],
  ] as [CheckStatus, string][])('%s → %s', (status, label) => {
    render(<CheckStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('ActionStatusBadge', () => {
  it.each([
    ['pending_confirmation', 'Ждёт подтверждения'],
    ['executing', 'Выполняется'],
    ['succeeded', 'Выполнено'],
    ['failed', 'Ошибка выполнения'],
    ['unknown', 'Статус уточняется'],
    ['cancelled', 'Отменено'],
    ['expired', 'Истекло'],
  ] as [ActionStatus, string][])('%s → %s', (status, label) => {
    render(<ActionStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('RequestStatusBadge', () => {
  it.each([
    ['submitted', 'Отправлена'],
    ['approved', 'Одобрена'],
    ['rejected', 'Отклонена'],
  ] as [AccessRequestStatus, string][])('%s → %s', (status, label) => {
    render(<RequestStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('GrantStateBadge', () => {
  it.each([
    ['absent', 'Доступа нет'],
    ['pending', 'Доступ выдаётся'],
    ['present', 'Подтверждён IAM'],
    ['unknown', 'Не удалось проверить'],
  ] as [GrantState, string][])('%s → %s', (state, label) => {
    render(<GrantStateBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('SyncStatusNote', () => {
  it('ok — ничего не показывает', () => {
    const { container } = render(<SyncStatusNote sync="ok" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('не-ok — предупреждение о сохранённом состоянии', () => {
    render(<SyncStatusNote sync="unavailable" />);
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось обновить статус');
  });
});

describe('CandidateStateBadge', () => {
  it.each([
    ['proposed', 'Предложен'],
    ['under_review', 'На рассмотрении'],
    ['accepted', 'Принят'],
    ['rejected', 'Отклонён'],
    ['resolved', 'Решён'],
  ] as [CandidateState, string][])('%s → %s', (state, label) => {
    render(<CandidateStateBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('EnrichmentBadge', () => {
  it.each([
    ['pending', 'Описание формируется'],
    ['failed', 'Ошибка обогащения'],
    ['completed', 'Описание готово'],
  ] as [EnrichmentStatus, string][])('%s → %s', (status, label) => {
    render(<EnrichmentBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('EscalationStatusBadge', () => {
  it.each([
    ['open', 'Открыто'],
    ['resolved', 'Закрыто'],
  ] as [EscalationStatus, string][])('%s → %s', (status, label) => {
    render(<EscalationStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('BlockerStatusBadge', () => {
  it.each([
    ['open', 'Активен'],
    ['resolved', 'Устранён'],
  ] as [BlockerStatus, string][])('%s → %s', (status, label) => {
    render(<BlockerStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
