// Синтетические объекты API v3 для тестов (те же формы, что отдаёт Go).

export const BRIEF_ID = '30000000-0000-4000-8000-000000000001';
export const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000011';
export const REPORT_ID = '30000000-0000-4000-8000-000000000021';
export const INTERN_A = '10000000-0000-4000-8000-000000000003';
export const INTERN_B = '10000000-0000-4000-8000-000000000004';
export const BUDDY_A = '10000000-0000-4000-8000-000000000001';
export const HASH = 'a'.repeat(64);
export const STAMP = '2026-11-13T10:00:00Z';

export const content = {
  title: 'ТЗ: отчёт',
  goal: 'Подготовить отчёт о подключении.',
  sections: [
    { id: 'report-format', title: 'Формат отчёта', text: 'Опишите шаги в свободной форме.' },
    { id: 'deadline', title: 'Срок', text: 'До конца недели.' },
  ],
  expected_result: 'Отчёт в документе команды.',
  acceptance_criteria: [{ id: 'steps', text: 'В отчёте перечислены шаги.' }],
  refs: [{ document_id: '0000000a-0000-4000-8000-00000000000a', version: 1 }],
};

export const contact = {
  status: 'available' as const,
  display_name: 'buddy-a',
  telegram_url: 'https://t.me/ai_buddy_demo_mentor_a',
  contact_revision: 1,
};

export const preview = {
  id: '30000000-0000-4000-8000-000000000031',
  text: 'Здравствуйте! Нужна помощь по онбордингу.\nШаг: Проверить доступ',
  content_hash: HASH,
  contact_revision: 1,
  telegram_url: contact.telegram_url,
  expires_at: '2026-11-13T10:10:00Z',
};

export function version(n: number, state: 'draft' | 'published', patch: Record<string, unknown> = {}) {
  return {
    brief_id: BRIEF_ID,
    version: n,
    state,
    content,
    content_hash: HASH,
    created_at: STAMP,
    ...(state === 'published' ? { published_at: STAMP } : {}),
    ...patch,
  };
}

export function brief(patch: Record<string, unknown> = {}) {
  return {
    id: BRIEF_ID,
    title: content.title,
    state: 'published' as const,
    latest_published_version: version(1, 'published'),
    draft: null,
    versions: [{ version: 1, state: 'published' as const, published_at: STAMP }],
    assignment_count: 2,
    open_report_count: 1,
    revision: 3,
    created_at: STAMP,
    updated_at: STAMP,
    ...patch,
  };
}

export function assignment(patch: Record<string, unknown> = {}) {
  return {
    id: ASSIGNMENT_ID,
    brief_id: BRIEF_ID,
    brief_version: 1,
    brief_state: 'published' as const,
    latest_published_version: 1,
    content,
    intern: { id: INTERN_A, display_name: 'intern-a' },
    author: { id: BUDDY_A, display_name: 'buddy-a' },
    reported_sections: [] as { section_id: string; reason: 'requirement_unclear' | 'outcome_unclear' | 'acceptance_unclear' }[],
    verification: 'not_verified' as const,
    revision: 1,
    created_at: STAMP,
    updated_at: STAMP,
    ...patch,
  };
}

export function report(patch: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    brief_id: BRIEF_ID,
    brief_title: content.title,
    brief_version: 1,
    latest_published_version: 1,
    section_id: 'acceptance_criteria',
    section_title: 'Критерии приёмки',
    reason: 'acceptance_unclear' as const,
    state: 'proposed' as const,
    current_count: 2,
    lifetime_count: 2,
    last_seen_at: STAMP,
    hypothesis: 'Наблюдение: 2 стажёра. Гипотеза: критерий не измерим.',
    suggestion: 'Предложение: добавить пример.',
    enrichment_status: 'completed' as const,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    ...patch,
  };
}

export function stats(patch: Record<string, unknown> = {}) {
  return {
    view: 'mentor' as const,
    source_kind: 'technical' as const,
    as_of: STAMP,
    timezone: 'Europe/Moscow' as const,
    window: { from: '2026-10-14T21:00:00Z', to: STAMP, days: 30 as const },
    privacy_threshold: 2 as const,
    summary: { affected_interns: 2, observations: 5, open_items: 2, suppressed: false },
    rows: [
      {
        key: { journey_id: 'db-access-team-a', step_id: 'check_connection', error_code: 'DB_SSL_REQUIRED' as const },
        label: 'Проверить подключение · DB_SSL_REQUIRED',
        metrics: { affected_interns: 2, observations: 3, open_items: 2, suppressed: false },
        related_reports: [{ id: REPORT_ID, kind: 'knowledge_gap_candidate' as const, state: 'proposed' as const }],
      },
      {
        key: { journey_id: 'db-access-team-a', step_id: 'check_connection', error_code: 'ACCESS_DENIED' as const },
        label: 'Проверить подключение · ACCESS_DENIED',
        metrics: { affected_interns: null, observations: null, open_items: null, suppressed: true },
        related_reports: [],
      },
    ],
    daily: [
      { date: '2026-11-12', affected_interns: null, observations: null, suppressed: true },
      { date: '2026-11-13', affected_interns: 2, observations: 5, suppressed: false },
    ],
    next_cursor: null,
    ...patch,
  };
}
