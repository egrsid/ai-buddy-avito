Ты работаешь над Avito AI-buddy — Engineering Onboarding & Feedback Loop.

Перед началом прочитай AGENTS.md и выполни Before starting: текущий статус,
Product Spec, Architecture/ADR, working agreements, назначенный backlog ID, spec/design/tasks
и дополнительные материалы своей области. Не используй superseded S1–S4 как текущий план.

**Роль:** [TL / Backend / AI Engineer / Frontend / Fullstack–QA–Integration]

**Задача, ID и приоритет:** [из docs/team/backlog.md]

**Зависимости и согласованные контракты:** [IDs; target v2, TL/consumer review]

**Материалы:** [свой docs/team/assignments/<role>.md, feature spec/design/tasks;
для контрактов — docs/team/contract-handoff.md и docs/architecture/contract-baseline.md]

**Приёмка:** [наблюдаемый результат + negative cases + команды проверки]

**Текущая назначенная ветка / папка:** [сверить docs/team/branches.md; предложенная ветка
не считается созданной. Работать только в предоставленной владельцем папке, не создавать/не переключать ветки]

**Директории:** [только назначенные компоненты]

**Ограничения:**
- Сохраняй чужие изменения, утверждённый стек и владельцев данных.
- У Fullstack только RP-QA-01; mock/seed Backend, AI/kb AI Engineer, browser E2E Frontend, infra/integration TL.
- Чтение чужих веток разрешено для inventory; менять их refs/содержимое запрещено.
- В текущем RP-TEAM-01 не делай commit/push; подготовь только docs и TL baseline, чужие схемы не реализуй.
- React → Go; Go владеет state/evidence/actions; Python предлагает и фильтрует знания до LLM.
- JSON journey фиксирует этапы/проверки. Нет ручного done или verified по ответу AI.
- Confirm отправки, human approval, фактический grant и DB evidence — разные результаты.
- Blockers/friction, два distinct interns, один candidate и human review входят в P0.
- Не добавляй HR, произвольный SQL/команды и функции вне спецификации.
- Не меняй shared contracts/ownership без TL/consumer review; legacy v1 не target DTO.
- Для RP-DOC-01 изменяй только документацию, без кода/JSON/DDL/seed/runtime материалов/config.
- Не коммить секреты и реальные данные; offline demo без сети/ключей обязателен.

**Перед завершением:**
1. make check и релевантные component checks по docs/testing/strategy.md; при изменении
   поведения tests и line coverage >80% каждого компонента. Для docs-only не выдавай
   прохождение legacy contract tests за приёмку новых возможностей.
2. Обнови SDD/backlog по фактическим результатам.
3. Укажи изменённые файлы, результат, проверки, ограничения и блокеры.
4. Подготовь локальное описание для владельца. Push/PR/merge/права выполняет только владелец;
   Codex co-author не добавляется. Ветки не создавать/не переключать.
