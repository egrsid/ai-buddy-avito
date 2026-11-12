# Ветки и текущая база команды

Исторический GitHub snapshot · 2026-11-12; строки других ролей ниже не являются новым аудитом.
Текущий checkout — feature/backend-mvp-v2, tracking origin/feature/backend-mvp-v2.
[TL integration record](tl-readiness.md) фиксирует импорт контрактов и результаты.

| Ветка | Head GitHub | Состояние |
|---|---|---|
| main | 30c5d08908aace5d10318adc429bbaa837b1a929 | Legacy bootstrap |
| feature/team-start-foundation | fe870967d98ba6cc93f679a8fb5ca6bea03641ab | TL; прежняя инфраструктура уже в head, текущий повторный review/план локально без commit/push |
| feature/backend-mvp-v2 | 4813d7caa4a586a6ac26749f523406602962e24d | Последний fetch; поверх head локальный незакоммиченный Go/corporate P0 runtime и tests |
| feature/ai-mvp-v2 | 3f955322eabd2874d5952e160ce1cf5c3898cb0d | Contract package + offline API/retrieval/diagnostics/corpus/evals; kb/ingest/readiness еще нет |
| feature/frontend-mvp-v2 | 676b81dd0cb1636a3b578459cd6404298f769335 | FE review/bindings/fixture UI |
| feature/qa-01-m1 | 1d47f6b2d58ded0eacd8e7588270b009663c9388 | Два legacy API-теста, QA-план |

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

По отдельному разрешению владельца выполнены fetch только Backend, создание локальной
tracking-ветки и switch в неё. TL ref c0659195c4879a6eedbf70014fb5a6879bb08e63 сохранён;
AI/FE/QA refs и файлы не менялись. Текущая реализация — working tree, не новый GitHub commit.
Результаты [Backend-проверок](tl-readiness.md) не меняют исторические consumer acknowledgements.
