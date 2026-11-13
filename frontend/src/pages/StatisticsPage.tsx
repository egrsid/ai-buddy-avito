import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { userMessage } from '../lib/api';
import { useLiveData } from '../lib/live';
import { href } from '../lib/router';
import type { StatisticsT } from '../lib/v3';
import { getStatistics } from '../lib/v3';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';

// V3-STATS-FE: только то, что посчитал Go для вашей области. Группы меньше 2 разных
// стажёров приходят без чисел — показываем «недостаточно данных», а не 0. Фильтра по
// стажёру и рейтингов нет; просмотр ничего не создаёт.

type Days = 7 | 30 | 90;
type Source = 'technical' | 'task_clarity';

const SOURCE_LABELS: Record<Source, string> = {
  technical: 'Технические трудности моих стажёров',
  task_clarity: 'Понятность моих ТЗ',
};

function value(n: number | null) {
  return n === null ? '—' : String(n);
}

export function StatisticsPage({ view }: { view: 'mentor' | 'documentation' }) {
  const [days, setDays] = useState<Days>(30);
  const [source, setSource] = useState<Source>('technical');
  const stats = useLiveData(() => getStatistics(view, days, source), [view, days, source], null as StatisticsT | null);

  return (
    <>
      <PageHeader
        title="Статистика затруднений"
        subtitle={view === 'mentor'
          ? 'Где стажёрам трудно: без имён и рейтингов, только ваша область'
          : 'Шаги с вашими инструкциями, где стажёры ошибаются'}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        {view === 'mentor' && (
          <div role="tablist" aria-label="Источник" className="flex flex-wrap gap-1">
            {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={source === s}
                onClick={() => setSource(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${source === s ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:bg-border'}`}
              >
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Период" className="flex gap-1">
          {([7, 30, 90] as Days[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === d ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary hover:bg-border'}`}
            >
              {d} дней
            </button>
          ))}
        </div>
      </div>
      {stats.state === 'loading' && <Card><LoadingState /></Card>}
      {stats.state === 'error' && <ErrorState message={userMessage(stats.error)} onRetry={stats.refetch} />}
      {stats.state === 'data' && stats.data && <StatisticsView stats={stats.data} />}
    </>
  );
}

export function StatisticsView({ stats }: { stats: StatisticsT }) {
  const { summary } = stats;
  const empty = stats.rows.length === 0;
  const max = Math.max(1, ...stats.daily.map((d) => d.affected_interns ?? 0));
  const openLabel = stats.source_kind === 'task_clarity' ? 'Открытых отчётов' : 'Открытых блокеров';
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Данные на {new Date(stats.as_of).toLocaleString('ru-RU')} ({stats.timezone}), окно {stats.window.days} дней.
        Группы, где меньше {stats.privacy_threshold} разных стажёров, скрыты.
      </p>
      {empty ? (
        <EmptyState title="Затруднений нет" message="За выбранный период в вашей области не было отмеченных проблем." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {summary.suppressed ? (
              <Card className="sm:col-span-3"><p className="text-sm">Итоги скрыты: среди групп есть такие, где меньше {stats.privacy_threshold} стажёров, — по итогу их можно было бы вычислить. Смотрите строки ниже.</p></Card>
            ) : (
              <>
                <Tile label="Затронуто разных стажёров" value={value(summary.affected_interns)} />
                <Tile label={stats.source_kind === 'task_clarity' ? 'Отметок' : 'Неудачных проверок'} value={value(summary.observations)} />
                <Tile label={openLabel} value={value(summary.open_items)} />
              </>
            )}
          </div>
          <Card>
            <h2 className="mb-3 font-medium">Динамика по дням: разные стажёры</h2>
            <div className="flex h-28 items-end gap-0.5" role="img" aria-label="График затронутых стажёров по дням">
              {stats.daily.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.suppressed ? 'недостаточно данных' : d.affected_interns}`}
                  className={`flex-1 rounded-t ${d.suppressed ? 'bg-border' : 'bg-primary'}`}
                  style={{ height: `${d.suppressed ? 8 : Math.max(2, ((d.affected_interns ?? 0) / max) * 100)}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-text-secondary">Серые столбцы — день скрыт: меньше {stats.privacy_threshold} стажёров.</p>
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">Где трудно</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-text-secondary">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Место и причина</th>
                    <th className="py-2 pr-3 font-medium">Стажёров</th>
                    <th className="py-2 pr-3 font-medium">{stats.source_kind === 'task_clarity' ? 'Отметок' : 'Проверок'}</th>
                    <th className="py-2 pr-3 font-medium">Открыто</th>
                    <th className="py-2 font-medium">Отчёт</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rows.map((row) => (
                    <tr key={row.label} className="border-t border-border">
                      <td className="py-2 pr-3">{row.label}</td>
                      {row.metrics.suppressed ? (
                        <td className="py-2 pr-3 text-text-secondary" colSpan={3}>недостаточно данных</td>
                      ) : (
                        <>
                          <td className="py-2 pr-3">{value(row.metrics.affected_interns)}</td>
                          <td className="py-2 pr-3">{value(row.metrics.observations)}</td>
                          <td className="py-2 pr-3">{value(row.metrics.open_items)}</td>
                        </>
                      )}
                      <td className="py-2">
                        {row.related_reports.map((r) => (
                          <a
                            key={r.id}
                            href={href(r.kind === 'task_clarity_report' ? `/mentor/reports/${r.id}` : `/knowledge-gaps/${r.id}`)}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            открыть <ArrowRight size={12} aria-hidden />
                          </a>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value: text }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{text}</p>
    </Card>
  );
}
