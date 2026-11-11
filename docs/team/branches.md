# Ветки и текущая база команды

Read-only GitHub snapshot · 2026-11-12. Текущий checkout — feature/team-start-foundation.
[TL integration record](tl-readiness.md) фиксирует импорт контрактов и результаты.

| Ветка | Head GitHub | Состояние |
|---|---|---|
| main | 30c5d08908aace5d10318adc429bbaa837b1a929 | Legacy bootstrap |
| feature/team-start-foundation | 12461629c61a7f540b8c33e0594ccf221edba883 | TL; текущие integration edits пока только локальные, без commit/push |
| feature/backend-mvp-v2 | 69fea38237068149a7aa07c840f98e1b280d5ca9 | BE contract package и расширенные fixtures |
| feature/ai-mvp-v2 | 0da47f66a30c3a5aad94ee0fe50a2bb059431e8d | AI contract package |
| feature/frontend-mvp-v2 | 676b81dd0cb1636a3b578459cd6404298f769335 | FE review/bindings/fixture UI |
| feature/qa-01-m1 | 1d47f6b2d58ded0eacd8e7588270b009663c9388 | Два legacy API-теста, QA-план |

Все назначенные ветки уже существуют. BE/AI/FE имеют общего предка
`a89be6364192be571f97ae12ad3f51ea53dd568c`: последний BE commit не включен в AI/FE.
Собственные поставки разделены по файлам, но FE bindings семантически отстают: 4/181
contract failures с последними BE fixtures. Git-слияние само это не исправит.

QA относительно foundation ahead 1/behind 3. Трехсторонняя проверка файла backlog дала
один conflict block: сохранить новый RP backlog и два авторских QA-файла, не возвращать
S1–S4/PATCH tasks. RP-QA-01 адаптируется на v2/goals; version conflict — Backend, полный
browser/restart — Frontend/TL. QA-файлы не перезаписываются чужим участником.

TL импортировал BE+AI contract artifacts в свою рабочую папку с source SHA и checksum
lock. Ни чужие refs/ветки, ни remote в этом поручении не меняются. Владелец/авторы
распространяют одну согласованную базу после review, сохраняя собственную работу.
Никакого reset/force-push чужих веток для этого не требуется.
