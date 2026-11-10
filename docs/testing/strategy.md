# Проверки и Definition of Done

## Сейчас

`make check` валидирует документацию/контракты/seed и проверяет Python утилиты.
`make test` дополнительно запускает component checks. Каркас содержит liveness и экран
состояния подготовки; прохождение checks не доказывает готовность сценариев S1–S4.
`make smoke` проверяет поднятые контейнеры. E2E сценарии из feature-specs пока предстоит реализовать.

## CI и покрытие

Обязательные jobs: contracts, python, frontend, backend, compose. Каждый прикладной компонент
имеет line coverage строго >80%, измеряется отдельно. Python fail-under=80.01;
frontend threshold=80.01; Go runner сравнивает точное отношение покрытых строк >80%, не >=80%. Тесты/сгенерированный код/
сторонние библиотеки исключены, handlers/use cases/validation включены. Только entrypoint wiring
main исключён из Go denominator; логика должна жить в internal. Прикладные новые файлы нельзя
добавлять вне измеряемых директорий. Пока есть только каркас, отчёт относится только к нему.
Примерно 80% и округлённые 80.0% не считаются достаточными.
Go также выводит стандартный statement coverage. Line metric строится по union строк
ненулевых statement blocks coverprofile; строка считается покрытой, только если все её
блоки исполнены. End position с column=1 не включает конечную строку. Метод фиксирован
в scripts/go_coverage.py и тестах; его соответствие трактовке организаторов сверяет TL-02.

Bootstrap-исключение: до появления бизнес-модуля проверяются compilation/build и явно
печатается BOOTSTRAP; coverage отсутствует. Логику запрещено помещать в entrypoint wiring.
С первой фичи тесты/порог обязательны; отсутствие тестов не даёт зелёную проверку.

Отчёты сохраняются CI artifacts. Требование организаторов и допустимость способа агрегации
сверяет TL-02; пока применяется более строгая независимая проверка каждого компонента.

## Матрица поведения

| Область | Обязательные проверки |
|---|---|
| Auth | Нет cookie; просроченная/отозванная сессия; Origin/CSRF; роль из БД |
| RBAC | intern-b не читает данные intern-a; buddy-b не читает его обращения; buddy не читает историю |
| S2 | Seed, список/детали, version conflict, progress, refresh/restart, изоляция task chats |
| S1 | Источники существуют; неизвестное не выдумано; injection не расширяет tools; context cap |
| SSE | EOF до completed; таймаут; disconnect; cancel; повтор GET не запускает второй run |
| S3 | Недостающие поля; без confirm; истёкшее/изменённое предложение; concurrent confirm; mock timeout; crash после create |
| S4 | Exact snapshot и назначенный buddy; reply+resolved атомарны; повтор reply; KB не меняется |
| DB | Миграции дважды; checksum mismatch; seed дважды не стирает прогресс; runtime не пишет в чужую схему |

Live evals проверяют качество отдельно от unit tests/coverage. CI не требует платного ключа.
На checkpoint E2E должен работать через настоящие Go/AI(mock)/corporate/БД, без перехвата бизнес-API.
Playwright skeleton не подменяет такие тесты; финальный полный путь описан в product spec §4.

## PR done

SDD и DTO актуальны; реализованы happy/error/empty states; проверки ролей на сервере;
миграция и seed воспроизводимы; релевантные tests/coverage прошли; команды и реальные ограничения
указаны в PR. Скриншот UI/ручная проверка адаптивности для frontend изменений.
