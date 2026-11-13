# Ветки и текущая база команды

Read-only GitHub snapshot · 2026-11-13. Текущий checkout — feature/team-start-foundation.
[TL integration record](tl-readiness.md) фиксирует импорт контрактов и результаты.

| Ветка | Source SHA на 13 ноября | Проверенное состояние |
|---|---|---|
| main | 30c5d08908aace5d10318adc429bbaa837b1a929 | Локальный legacy ref, remote повторно не проверялся |
| feature/team-start-foundation | 61b6add | База владельца с прошлой TL/AI поставкой; текущие demo integration/QA fixes локально без commit |
| feature/backend-mvp-v2 | ea2cfbe35abb027c921c7e38882f43469e0fdadc | Runtime/migrations/v2 seed; source импортирован в TL |
| feature/ai-mvp-v2 | aa6ff38d6dbb77ec427991913152cd6b10e311bf | Persistent kb/live adapters/budget/evals; source импортирован, citations/failover delta только в TL |
| feature/frontend-mvp-v2 | 1f96778b5da0f5d6d2194d3d79d6fd1a56fce224 | request/SSL поставка импортирована; TL integration fixes, 474 tests и browser 4 PASS |
| feature/qa-01-m1 | f88228cb5b1d669f05958c706e2c236c8cc7834f | Два адаптированных API tests; в TL 2 PASS |

Текущий source manifest: [integration-sources.json](integration-sources.json). Чужие refs не менялись.

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
