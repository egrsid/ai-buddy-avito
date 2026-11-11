# TL readiness и решения по интеграции

2026-11-12. Владелец поручил выполнить TL-часть в `feature/team-start-foundation`.
Дедлайн владельца: **2026-11-12 22:00 Europe/Moscow**. Это срок, не утверждение готовности.
Ни чужие ветки, ни refs, ни remote не изменены. Новая ветка не потребовалась; commit/push/PR нет.

## Проверенная поставка и происхождение

| Пакет | Проверенный commit GitHub | Что включено в TL checkout |
|---|---|---|
| Backend | 69fea38237068149a7aa07c840f98e1b280d5ca9 | Пять v2 schemas, examples/invalid, общий validator/tests; contract validation в check_repo |
| AI | 0da47f66a30c3a5aad94ee0fe50a2bb059431e8d | ai.schema.json, AI examples/invalid и девять contract tests |
| Frontend | 676b81dd0cb1636a3b578459cd6404298f769335 | Изучен review/код; frontend в TL checkout не копируется и не исправляется за автора |
| QA | 1d47f6b2d58ded0eacd8e7588270b009663c9388 | Изучены legacy tests; QA-файлы не перезаписываются |

JSON-файлы BE/AI импортированы без изменения. `contracts/v2/BASELINE.sha256` фиксирует
состав и SHA-256 каждого JSON. `python -m scripts.contract_baseline` проверяет смешение
версий; `--write` обновляет lock после согласованной поставки, но не заменяет review.
Legacy v1 остается отдельным проверяемым пакетом, не runtime-совместимостью v2.

## Решения TL по frontend review 3.1–3.9

1. Расширенные BE fixtures принимаются для технической проверки. FE должен повторить
   consumer test на этой версии: в аудите 4/181 failures, не условное молчаливое approval.
2. Принимаются уточнения BE: cancelled без error_code; interrupted только с
   STREAM_NOT_OPENED/CLIENT_DISCONNECTED; completed с assistant_message_id. Пустого
   assistant Message нет; до первого токена остается только терминальный Run.
3. ResourceAccess до проверки: unknown, stale=true, observed_at отсутствует. После
   наблюдения время обязательно. Закрытый/неизвестный ресурс дает одинаковый 404.
4. Error.fields.name в P0 остается **верхнеуровневым именем поля**. Для вложенной ошибки
   options.ssl_mode передается name=options и safe code; dotted paths не добавляем.
5. Все list API возвращают {items:[...]}; GoalList содержит полные Goal со steps в P0.
6. Для GET /goals/{id}/steps/{step_id}/actions выбран {items: RecoveryAction[]} — тот же
   вычисленный allowlist, что Step.available_actions, без второго источника состояния.
   **Backend добавляет StepActionList/schema/example/invalid, FE binding.** До этой поставки
   endpoint не считается покрытым контрактом; TL не меняет авторскую schema за Backend.
7. Optional означает absent, не null. Nullable исключения: User.buddy_id и общий
   Conversation.goal_id/step_id. Backend добавляет negative fixtures для optional null,
   FE повторяет parsing. Go использует omitempty там, где null запрещен.
8. Три mandatory steps и blocker-context handoff — осознанные P0-ограничения. FE
   показывает Action.preview, а не самостоятельно собирает parameters в preview.
9. TTL вычисляет Go. Ответы создания/чтения Action имеют HTTP Date (серверное UTC-время).
   UI оценивает remaining от Date и времени получения; created_at не является текущими
   часами. Таймер UI справочный, право confirm окончательно проверяет сервер.

Это решения TL в ответ на конкретные вопросы потребителя. Авторы подтверждают их
соответствующими schemas/tests и записанным review, а не новым устным согласованием.
RP-CONTRACT-REVIEW-01: **IN_PROGRESS**. Техническая проверка предъявленных BE+AI schemas
выполнена, но final acceptance зависит от п. 6–7 и повторного FE/BE↔AI review.
Нельзя отмечать parent DONE до этих результатов. До gate доступны проектирование и
подготовка component tests; общие runtime DTO закрепляются после consumer acceptance.

## Реализованная TL инфраструктура

- Python production image включает contracts/ для offline refs; отдельный test target
  содержит dev dependencies. Непривилегированный app имеет writable coverage directories.
- compose.mvp.yaml — явный target overlay. Ingest ждет seed, AI ждет ingest и /readyz;
  отдельный ai-db-tests получает только ai_service DSN, mock LLM и пустой LLM_API_KEY.
- AI сам поставляет две команды как JSON argv arrays: AI_INGEST_COMMAND и
  AI_DB_TEST_COMMAND. scripts.ai_tasks запускает их без shell, сохраняет nonzero exit,
  запрещает admin DSN и unsafe fault config. Нет фиктивного ingest/test по умолчанию.
- make mvp-preflight/mvp-up/ai-db-test и opt-in workflow_dispatch mvp_acceptance
  подключены. Отсутствующие компоненты/CLI дают BLOCKED/nonzero; это не green MVP.
- CI compose проверяет v2 schemas в непривилегированном test image. Настоящий AI DB job
  включается явно после поставки команд/реализации, через repository vars с JSON argv.
- Общие seed/migrate/check reads и hashes используют explicit UTF-8; regression tests
  проверяют кириллицу/emoji/hash и неизменность migration checksum. Applied 001 не менялись.
- verify-db проверяет наличие seed IDs без требования, чтобы в БД было ровно 4 аккаунта;
  дополнительные записи не требуют reset. Сам seed/DDL остается legacy до поставки BE/AI.
- BACKEND_PORT/FRONTEND_PORT позволяют поднять отдельное окружение без захвата 8080/5173.

Общие manifests/locks не менялись: запроса минимальных production deps от AI пока нет.
После поставки v2 seed/table layout нужны точная адаптация seed/check/verify-db и реальный
повторный прогон; нельзя объявить RP-DATA-TL-01 завершенной на v1.

## Проверки и ограничения

Фактические проверки TL: clean bootstrap Compose в отдельном проекте
`ai-buddy-tl-20261111`, новые volume/network, порты 18080/15173; повтор migrate/seed дважды;
verify-db (seed IDs/role isolation); liveness smoke. Всё успешно на **legacy dataset**.
11 v2 contract tests прошли внутри собранного test image под app, без LLM/сети во время tests.
Локальный make check: 50 tests passed, lint/format/docs/schema checks passed.
make test на хосте остановился на отсутствии go; backend vet/build успешно выполнены отдельно
закрепленным Go 1.27.3 container (read-only source). AI/mock component checks — BOOTSTRAP,
не business coverage. Frontend TL checkout — bootstrap build, не remote FE prototype.
После настоящего restart PostgreSQL/backend verify-db снова прошел; это legacy persistence.

Это не новая auth/journey/IAM реализация, не full P0 E2E и не offline AI evaluation.
Прежние FE findings: build/171 tests pass, coverage 48.09%; текущие BE fixtures дают FE
4/181 failures. Чужие ветки не исправлялись, результаты не выдаются за актуальный FE pass.
MVP preflight ожидаемо BLOCKED: runtime v2/migrations/CLI/browser tests еще отсутствуют.

## Что не может быть принято без чужой поставки

| TL задача | Реальное состояние / необходимый вход |
|---|---|
| RP-CONTRACT-REVIEW-01 | TL решения/проверка готовы; нужны schema additions и consumer acknowledgements |
| RP-INF-01 | Bootstrap/image/config проверены; target ingest/readiness/AI DB tests ждут AI runtime/CLI/tests |
| RP-DATA-TL-01 | UTF-8/runner foundation проверены; v2 seed/schema layout/IDs еще нужны от BE/AI |
| RP-INTEGRATION-01 | Нужны настоящие BE/AI/FE runtime, API/browser/security/coverage reports |
| RP-DEMO-01 | Нужен принятый работающий путь для честной репетиции/видео/PDF |
| RP-TL-02 | Срок 12 ноября 22:00 подтвержден владельцем; оригиналы требований/формат сдачи отсутствуют |

До получения оригиналов внутренний release gate — Product Spec/SDD/testing strategy:
offline local P0, четыре прикладные роли, >80% каждого компонента, A/B/C и negative tests.
Соответствие неизвестным правилам организаторов не утверждается. Live provider/embeddings,
public hosting, второй journey и P1/P2 не добавляются в дедлайн. Ключ/бюджет P0 не требует.
Публикация/доставка локального результата в рабочие ветки еще не выполнялась; чужие ветки
обновляет их автор/владелец по Git-контракту. Перед обновлением сверить текущие heads.

Изолированный проект после проверки остановлен командой compose down **без --volumes**;
его ai-buddy-tl-20261111_pgdata сохранен. Docker Desktop остается запущенным. Контейнеры
и volumes других проектов не менялись.
