"""Synthetic v3 additions on top of the v2 dataset: mentor Telegram contacts and one demo brief.

Idempotent: existing contacts, briefs and assignments are never overwritten.
"""

import hashlib
import json
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]


def content_hash(content: dict) -> str:
    # Same bytes as Go json.Marshal of a map: sorted keys, no spaces, UTF-8 as is.
    raw = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def seed_v3(connection) -> None:
    data = json.loads((ROOT / "data/seed/demo-v3.json").read_text(encoding="utf-8"))
    connection.execute("SET LOCAL ROLE app_owner")
    for contact in data["mentor_contacts"]:
        connection.execute(
            "INSERT INTO app.mentor_contacts(mentor_id,telegram_username) VALUES (%s,%s) "
            "ON CONFLICT DO NOTHING",
            (contact["mentor_id"], contact["telegram_username"]),
        )
    for brief in data["task_briefs"]:
        inserted = connection.execute(
            "INSERT INTO app.task_briefs(id,owner_id,team_id) VALUES (%s,%s,%s) "
            "ON CONFLICT DO NOTHING RETURNING id",
            (brief["id"], brief["owner_id"], brief["team_id"]),
        ).fetchone()
        if not inserted:
            continue
        connection.execute(
            "INSERT INTO app.task_brief_versions"
            "(brief_id,version,state,content,content_hash,published_at,published_by) "
            "VALUES (%s,%s,'published',%s,%s,now(),%s)",
            (
                brief["id"],
                brief["version"],
                Jsonb(brief["content"]),
                content_hash(brief["content"]),
                brief["owner_id"],
            ),
        )
        for index, intern in enumerate(brief["assign_to"], start=1):
            assignment = f"{brief['id'][:-2]}{index + 10:02d}"
            connection.execute(
                "INSERT INTO app.task_assignments"
                "(id,brief_id,brief_version,intern_id,assigned_by) VALUES (%s,%s,%s,%s,%s) "
                "ON CONFLICT DO NOTHING",
                (assignment, brief["id"], brief["version"], intern, brief["owner_id"]),
            )
    connection.execute("RESET ROLE")
