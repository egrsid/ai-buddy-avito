# AI-редактор исправления ТЗ — design v4

Target proposal; [spec](spec.md), [общая архитектура](../../architecture.md).

Go формирует RevisionProposal с owner/report/base version/content hash и generation token.
Python возвращает bounded structured draft по allowlist из общей architecture.
FE отображает текстовый diff без raw HTML, old/new и связь каждого change с report/section.
Source drawer повторно проверяет ACL; правка ссылки не открывает произвольный URL.

Если есть ручной draft — proposal строится относительно его конкретной revision с
published base ref; применение не затирает параллельные изменения. Опубликованный текст
в diff остаётся доступен как отдельная reference. Смена исходной версии/прав/draft hash
между generation и apply → 409 и новый preview. TTL=10m проверяет Go, часы UI вспомогательные.

Фоновый AI вызов вне app transaction; request replay и restart не создают второй proposal.
Поздний результат после discard/revoke не заменяет актуальный draft. Selected changes
проверяются на пересекающиеся field paths; конфликтующие replacements отклоняются.
Никаких arbitrary JSON Patch paths. Замена criteria сохраняет IDs существующих элементов;
новые ID создаёт сервер, удаления требуют явного выбора автора и preview.

Empty/schema/injection/foreign citation/unsupported claims → rejected output + safe failure;
ручной editor работает. Offline deterministic предложение только явный шаблон, не имитация live.
Перед provider фильтруются title, соседние criteria и refs, не только основной текст.
Минимум 24 новых eval cases, включая ≥10 safety, плюс проверка полезности diff человеком.

Schemas/migrations и публичные поля принимаются в V4-CONTRACT-01, не этим Markdown.
