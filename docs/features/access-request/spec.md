# S3 · Заявка на доступ

Версия 1.0 · статус: спецификация для реализации, не готовая фича.
Владельцы: Backend + AI + Frontend. Задачи: BE-04/05, FE-03/04.

## Критерии приёмки

- [ ] Без resource, access_level, reason предложение не готово к confirm.
- [ ] Preview показывает точные данные; без confirm нет external write.
- [ ] Повторный/concurrent confirm создаёт одну persistent mock-заявку.
- [ ] После crash между mock create и app save сверка по operation_key восстанавливает результат без дубля.
- [ ] Пользователь видит реальный ID/status; submitted не означает предоставленный доступ.
- [ ] Таймаут, expired/cancelled/unknown отображаются явно; другой intern не читает результат.

## Границы

Только intern/buddy, синтетические данные, без HR и реальных корпоративных прав.
Поведение API/security/state-machines обязательно; изменение через TL review.

## Ручная проверка

Создать sandbox/backend write, подтвердить дважды → один mock_id. Отключить mock перед отправкой → ошибка/unknown без успеха. Восстановить и сверить по operation key. sandbox/restricted → rejected.
