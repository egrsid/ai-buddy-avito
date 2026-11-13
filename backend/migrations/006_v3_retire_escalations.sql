-- v3 replaces internal intern-to-buddy escalations with a Telegram link. Old escalations stay
-- readable; open blockers stop offering the retired action. Pending escalation actions are
-- cancelled by the backend at startup with an audit event (escalation_retired).
UPDATE blockers SET recovery_actions = recovery_actions - 'escalate_to_buddy'
WHERE recovery_actions ? 'escalate_to_buddy';
