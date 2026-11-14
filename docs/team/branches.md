## V4 planning · 14 ноября 2026

Единственная ветка изменений этого поручения: `docs/v4-planning`, от локальной
`feature/local-v3-integration` f4f63a0. Проверенный current checkout перед стартом чист.
main b6f940d остаётся v2, source frontend-v3 363a0e5 уже включён в интеграцию.
Remote inventory не обновлялся этим docs-проходом. Новые feature/*-v4 branches
только предложены в [delivery](../v4/delivery.md), не созданы. Ни push/PR/remote merge.
Ниже прежние inventory, не текущая база новой разработки.

# Ветки и текущая база команды

Актуальный remote audit: [13 ноября, перед v3](repository-audit-2026-11-13.md).
main b6f940d опубликован, совпадает с локальным main, latest CI success.
AI 9b54700, BE ea2cfbe, FE c814283, QA f88228c, TL b0e5529 не обновились.
Текущая локальная docs ветка — docs/v3-planning от main; код и remote refs не меняются.

Следующая работа: [V3 delivery и proposed branches](../v3/delivery.md).
Новые компонентные v3 branches пока не созданы. Старые branches не сливать вслепую;
main содержит принятые snapshots, граф ancestry отличается от содержимого файлов.

Ниже — история интеграции v2, не состояние текущего checkout и не новый backlog.

## Каноническая локальная ветка — main · 13 ноября

В main локально включена TL история до b0e5529 и проверенный финальный AI snapshot
9b54700 с исправлениями из tmp/final-ai. Корень проекта переключён на main;
собирать Docker командой `make main-demo` отсюда. AI worktree сохранена как источник,
больше не используется для основного запуска. Remote main агент не изменял.
Исходные feature branches сохранены. [Проверки/результат](tl-readiness.md).


## Повторная remote-сверка всех веток · 13 ноября

GitHub connector: search_branches + compare_commits, затем чтение immutable snapshots.
Прямой git fetch оборвался Connection reset by peer; refs/ветки не обновлялись.

| Ветка | Последний remote SHA | Решение для сводного демо |
|---|---|---|
| main | 30c5d08908aace5d10318adc429bbaa837b1a929 | Без новых изменений, legacy |
| feature/team-start-foundation | d9792ced0585ad29cfd7e95f0d46dde5dc720c3a | Текущая чистая owner-база до этого прохода |
| feature/backend-mvp-v2 | ea2cfbe35abb027c921c7e38882f43469e0fdadc | Без новых изменений, уже импортирован |
| feature/ai-mvp-v2 | 25ac58f91efec6f551d24dd59820a59f5dcdf56a | Новые AI runtime/tests/eval reports импортированы в TL; consumer fixes TL сохранены |
| feature/frontend-mvp-v2 | c814283909dcbc672aa014fa3bd7349d6025e240 | Session/context fixes перекрываются TL; новые совместимые tests/fixtures взяты из AI cherry-pick этой поставки |
| feature/qa-01-m1 | f88228cb5b1d669f05958c706e2c236c8cc7834f | Без новых изменений; исходные API tests сохранены |

AI ветка содержит TL d9792ce и последующие доработки: полный tree delta 24 файла.
Перенос всей ветки не нужен: исключены Go syntheticKnowledge и отдельный chat route,
которые дублируют authoritative kb/встроенный чат. Manifest хранит импортированные файлы
и точные SHA; [решения и повторная приемка](tl-readiness.md).


## История inventory 12 ноября


Все назначенные ветки уже существуют. BE/AI/FE имеют общего предка
`a89be6364192be571f97ae12ad3f51ea53dd568c`: последний BE commit не включен в AI/FE.
Собственные поставки разделены по файлам, но FE bindings семантически отстают: 4/181
contract failures с последними BE fixtures. Git-слияние само это не исправит.

Повторный [AI review](ai-review-2026-11-12.md): семь commits после 0da47f6, 38 файлов.
AI schema не изменилась; 184 tests проходят и с TL schemas. Найдены AI-R1–R4;
новый runtime остается в AI-ветке, не импортирован этим документационным проходом.
TL/BE/AI/FE heads сверены заново; main/QA строки — предыдущий snapshot, не новый review.

QA относительно foundation ahead 1/behind 3. Трехсторонняя проверка файла backlog дала
один conflict block: сохранить новый RP backlog и два авторских QA-файла, не возвращать
S1–S4/PATCH tasks. RP-QA-01 адаптируется на v2/goals; version conflict — Backend, полный
browser/restart — Frontend/TL. QA-файлы не перезаписываются чужим участником.

TL импортировал BE+AI contract artifacts в свою рабочую папку с source SHA и checksum
lock. Ни чужие refs/ветки, ни remote в этом поручении не меняются. Владелец/авторы
распространяют одну согласованную базу после review, сохраняя собственную работу.
Никакого reset/force-push чужих веток для этого не требуется.
