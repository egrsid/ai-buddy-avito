// Человеческие подписи для технических значений, которые приходят с сервера.
// Неизвестное значение показываем как есть: новое поле не должно ломать страницу.

const STEP_TITLES: Record<string, string> = {
  select_resource: 'Выбрать ресурс',
  check_access: 'Проверить доступ',
  check_connection: 'Проверить подключение',
};

const METHOD_LABELS: Record<string, string> = {
  resource_policy_match: 'ресурс разрешён политикой',
  iam_permission_present: 'роль найдена в IAM',
  mock_db_connection: 'подключение к учебной БД',
};

const SOURCE_LABELS: Record<string, string> = {
  go_policy: 'политика доступа',
  go_check: 'проверка системы',
  go_access: 'система заявок',
  mock_iam_adapter: 'учебный IAM',
  mock_access_adapter: 'учебная система заявок',
  mock_db_adapter: 'учебная БД',
};

export const stepTitle = (id: string): string => STEP_TITLES[id] ?? id;
export const methodLabel = (method: string): string => METHOD_LABELS[method] ?? method;
export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? source;

/** Время по часам пользователя вместо ISO в UTC: «15.11.2026, 14:47». */
export function localTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
