# Проверка репозитория перед v3 · 13 ноября 2026

Read-only GitHub API audit: search_branches, compare_commits, recursive Git trees и Actions.
Доступ к актуальному GitHub есть; локальные старые refs не использовались как remote факт.

| Remote branch | HEAD | Результат |
|---|---|---|
| main | b6f940d4e956bdbb12691aceb50598b99daee557 | Совпадает с локальным main, финальная интеграция опубликована владельцем |
| feature/ai-mvp-v2 | 9b54700d015106ad5ad5394307789b269a1f724a | Последняя принятая AI/UI поставка, без новых изменений |
| feature/backend-mvp-v2 | ea2cfbe35abb027c921c7e38882f43469e0fdadc | Принятая BE поставка, без новых изменений |
| feature/frontend-mvp-v2 | c814283909dcbc672aa014fa3bd7349d6025e240 | Принятая FE поставка, без новых изменений |
| feature/qa-01-m1 | f88228cb5b1d669f05958c706e2c236c8cc7834f | Исходные QA smoke, без новых изменений |
| feature/team-start-foundation | b0e55292f98b18ee5b80f0b814b5f58ea3930a9a | TL интеграционная база, без новых изменений |

Latest main Actions: [checks — success на b6f940d](https://github.com/egrsid/ai-buddy-avito/actions/runs/43435002217).
Исторический failed run относится к другому старому commit и не является статусом main.
Содержимое jobs/logs отдельно не переаудировалось; общий green не доказывает live quality.

## Проверка содержимого, а не только графа

GitHub recursive trees main/AI прочитаны полностью, truncated=false. В frontend/backend/
ai-service/mock-services/contracts/data отличаются только LiveStepPage.tsx и его тест:
это принятый TL check/version pending guard. Остальной runtime/seed/contracts совпадает
с выбранной AI версией. Прочие различия — README/AGENTS/Makefile/ignore/team records.
main содержит рабочую сборку, а не только старую документацию или bootstrap.

Compare AI…main показывает diverged (ahead 2, behind 40): main получил verified snapshot,
а не Git merge оригинальной AI ancestry. Это ожидаемая история, не потеря 40 изменений.
Не выполнять слепой merge старых branches: он может вернуть superseded настройки/дубли.
Новые v3 branches начинать от общего main + принятого docs-пакета, сохраняя свои local changes.
Удаление/force-reset старых branches не требуются.

## Остаток

У старых v2 документов накоплены исторические формулировки planned/bootstrap/старые SHA.
Приоритетные v3-вставки отделяют их от текущего плана. Открытые formal consumer/live gates
не объявляются закрытыми green CI. Новый продуктовый scope пока только docs, code main/v2
не изменён и Docker/пользовательская БД в этом проходе не перезапускались.

V3 документация подготовлена локально в docs/v3-planning от main. Публикация этой ветки,
PR и доставка пакета участникам остаются у владельца репозитория.
