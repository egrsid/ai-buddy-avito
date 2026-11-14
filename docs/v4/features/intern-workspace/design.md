# Единое рабочее пространство — design v4

Target proposal; [spec](spec.md), [общая архитектура](../../architecture.md).

Workspace — read projection assignment + explicit WorkspaceLink + permitted own goal.
Само объединение не создаёт новую бизнес-роль или goal state machine. Template allowlist
и link semantics описаны в architecture; при rebind требуется expected_revision и exact preview.
Assignment может иметь только один активный link, исторические links остаются audit-only.

List отдаёт bounded summaries всех workspaces и separate unlinked goals; FE догружает
страницы автоматически, не теряет элементы после goals[0], dedup по entity IDs и link IDs.
Goal один, даже если связан с несколькими ТЗ. Заголовки из закрытых целей не попадают в
summary. Logout/account switch отменяет fetch/cache и очищает данные прошлого subject.

Дизайн сохраняет палитру/типографику/карточки v3 из UI_GUIDELINES. Primary action — из Go
available actions; FE не делает вывод о permission по статусу/тексту модели. Показываются
title/result → state → blocker → next action → evidence/AI. Подробности в collapse/drawer;
mobile 390px, aria-expanded/controls, focus restore, Enter/Space и direct URLs обязательны.
Навигационные labels можно сократить после usability, смысл различий остаётся явным.

Schemas/migrations и публичные поля принимаются в V4-CONTRACT-01, не этим Markdown.
