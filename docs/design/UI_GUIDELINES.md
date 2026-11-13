# AI-buddy — UI Design Guidelines

**V3 target:** [новый сценарий/требования](../v3/product.md). Нижний текст — baseline v2.
В v3 нет inbox/reply стажёрских обращений; наставник получает кабинет ТЗ и агрегаты
понятности, стажёр — Telegram/copy. Выбранный дизайн main сохраняется, реализация TODO.

Версия 2.0 · 2026-11-11 · Visual Design Reference для целевого MVP.
Основной референс: `docs/design/ui-reference.png`; визуальный стиль сохраняется,
информационная иерархия изменена по [Product Spec](../product/specification.md).
Сейчас frontend — bootstrap screen, продуктовые страницы ещё не реализованы.

## 1. Концепция и иерархия

Светлый, дружелюбный, минималистичный, технологичный интерфейс. На первом плане
**цель → состояния шагов → blocker → следующее допустимое действие → evidence и AI**.
Контекстный чат помогает выполнить шаг, но не занимает всё смысловое пространство.
Пользователь различает утверждение, рекомендацию, согласование и проверенный результат.
Единая дизайн-система для intern, buddy, access_approver и documentation_owner, без HR.

## 2. Палитра

| Токен | Цвет | Применение |
|---|---|---|
| primary | #7839ED | Основное действие, активные элементы |
| primary-hover | #6427D6 | Hover |
| primary-light | #F0EAFF | Выделение, user message |
| background | #FAF9FE | Фон |
| surface | #FFFFFF | Карточки/панели |
| surface-muted | #F6F5FB | Второстепенные блоки |
| text-primary | #171722 | Основной текст |
| text-secondary | #77768A | Подписи |
| border | #E7E5F0 | Контуры |
| success | #2DBE57 | Проверено |
| warning | #F2C46D | Ожидание |
| error | #E45757 | Ошибка |

Приблизительные reference tokens централизуются в теме. Цвет всегда дополняется
текстом и иконкой. Inter с кириллицей: h1 24–28px semibold, карточки 18–20px,
body 14–16px, controls 14px medium, подписи 12–13px; читаемая высота строки.

## 3. Layout и навигация

Desktop сохраняет три области reference: navigation 250–270px, workspace 680–850px,
context sidebar 350–420px. Логотип и компактная карточка помощника остаются.
Переключение synthetic account выполняет новый server login, не клиентскую смену role.

Первый раздел intern — «Моя цель» (/onboarding), затем «Мои заявки» (/requests),
вспомогательный «AI-помощник» (/chat). В workspace — текущая цель, progress по verified,
step list, blocker и next action. Детали /onboarding/{goalId}/steps/{stepId} включают
контекстный чат и материалы. Sidebar — dependencies, evidence, актуальная заявка,
следующее действие и buddy. Чат может занимать всё рабочее пространство только
вспомогательной страницы /chat, не главного экрана цели.

Другие роли получают scoped navigation: /buddy/escalations[/{id}], /approvals,
/knowledge-gaps[/{id}]. Не показывать разделы без серверных полномочий.
Источники открываются в drawer с повторной ACL-проверкой; отдельного каталога KB нет.

## 4. Общие компоненты

Белые/светлые карточки, radius 16–20px, тонкий border, мягкая тень; padding 16–24px,
gap 12–20px. Поля radius 10–14px, видимый focus, label не заменяется placeholder,
error/disabled доступны. Primary — фиолетовая кнопка с белым текстом; secondary —
белая с border; ghost — второстепенное действие. Lucide, одинаковая толщина, 18–24px.

Preview обязателен для отправки заявки и диагностического handoff. Отдельное scoped
решение approver не объединять с кнопкой intern. Safe check — явная кнопка, повторное
modal-подтверждение не нужно; AI предлагает кнопку, сам не исполняет. Review candidate
показывает точный объект и решение; accepted объясняет, что публикация не выполнена.

## 5. Goal, Step и Evidence

Goal card: результат, версия маршрута, verified/total, следующий шаг. Step card:
что/зачем, dependencies, инструкция, доступный action, state, evidence source/time,
отдельные blocker и безопасный error code. Статусы: unverified («не проверено»),
ready («можно выполнять»), blocked («есть препятствие»), waiting_external («ожидаем»),
verified («проверено mock-проверкой»). Ни checkbox «Готово», ни ручной select verified.
User claim/manual confirmation показываются отдельно и не прибавляют technical progress.

Устаревший результат помечается временем/stale. Источник synthetic явно указан;
healthcheck или согласование не оформляются как успешная проверка подключения.
Loading/error/empty/forbidden/version conflict и недоступность check обязательны.

## 6. Заявка и ошибка

Request card: ресурс, requested role, основание, preview/confirm, ID, submitted/approved/
rejected, grant_state и sync_status. Отдельно показываются «отправлена», «одобрена»,
«доступ подтверждён IAM» и «подключение проверено». Unknown/timeout/expired/cancelled
не выглядят как успех. Retry не отправляет новую заявку, пока unknown не сверён.
/approvals — минимальный экран назначенного approver с approve/reject и основанием;
пометка mock, никакой автоматической выдачи по таймеру.

Error card: step, безопасный code (DB_SSL_REQUIRED), понятное объяснение/гипотеза,
допустимый recovery, recheck и buddy. Не показывать DSN, raw stacktrace/SQL/секреты.

## 7. Контекстный AI

User bubbles справа, светло-фиолетовые; AI слева, neutral surface, avatar, timestamp.
Markdown без raw HTML. Действия — реальные interactive cards: draft, confirm, request
state, evidence, error, handoff и permitted sources. Подсказки ориентированы на действие:
«Проверить доступ», «Что мешает подключению?», «Повторить проверку».

Ожидание LLM/инструмента, streaming, partial/interrupted/cancelled, error/timeout,
неизвестный ответ и safe retry обязательны. После SSE разрыва REST восстанавливает
состояние, а не повторяет действие. Не показывать успешное выполнение до ответа Go.

## 8. Buddy и ответственный за документацию

Buddy queue/detail: synthetic intern, goal/step, blocker, check outcomes, ошибки,
предыдущие safe действия, разрешённые инструкции, hypotheses/confidence, вопрос.
Intern видит точный snapshot/получателя до confirm. «Ответить и закрыть» атомарно
закрывает обращение; UI предлагает recheck и не помечает цель verified от ответа.

Owner candidate card: journey/step, instruction/version, normalized error, affected_count,
наблюдаемый повтор, предполагаемая причина и proposed fix. Нет списка людей, raw logs
или чатов. Review proposed/under_review/accepted/rejected/resolved; решение и причина,
для resolved — проверенная ссылка на исправленную версию. Это минимальная обратная
связь по документу, не HR dashboard и не кадровая оценка. Auto-publish отсутствует.

## 9. Адаптивность и доступность

Desktop >=1280px — три области; tablet 768–1279px — compact nav, sidebar в drawer;
mobile <=767px — одна колонка и выдвижная навигация. Цель, blocker, next action и
результат остаются доступны, формы без горизонтальной прокрутки. Чат по ширине экрана.
Клавиатура, visible focus, контраст, подписи и текстовые статусы обязательны; длительный
LLM не блокирует всё приложение, независимая прокрутка контекста/чата допустима.

## 10. Технологии, порядок и границы

React/TypeScript/Tailwind/Lucide, TanStack Query для server state, Zod target DTO;
React state, Zustand только по необходимости. Переиспользовать общую UI-библиотеку.
До реализации прочитать guidelines/reference/Product Spec/SDD и существующий frontend;
проверить новые состояния, mobile/keyboard и tests. Приоритет: Product/security →
feature spec → guidelines → image. Reference — концепт, не рабочее приложение:
репозиторий, 2/4 задач, номер заявки, SLA, attachment/voice не обязательные функции.

HR, полноценный мессенджер, загрузка файлов, push и обещания реальных доступов вне MVP.
Расширенный граф/evidence UI/history — P1 после стабильного P0, не повод задерживать
основной workflow. Fixtures/красивый экран не заменяют Go/mock integration.
