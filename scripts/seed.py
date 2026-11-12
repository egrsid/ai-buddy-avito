"""Idempotent synthetic seed: existing progress/content is never silently overwritten."""

import hashlib
import json
import os
from pathlib import Path

from psycopg.types.json import Jsonb

from scripts.db import connect

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if os.environ.get("SEED_DATASET", "legacy") == "v2":
        from scripts.seed_v2 import seed

        with connect() as connection:
            seed(connection)
        return
    if os.environ.get("SEED_DATASET", "legacy") != "legacy":
        raise ValueError("SEED_DATASET must be legacy or v2")
    data = json.loads((ROOT / "data/seed/demo.json").read_text(encoding="utf-8"))
    with connect() as connection:
        connection.execute("SET LOCAL ROLE app_owner")
        for user in sorted(data["users"], key=lambda u: u["role"] != "buddy"):
            connection.execute(
                "INSERT INTO app.users(id,account_id,display_name,role,team,buddy_id) "
                "VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                tuple(
                    user[k]
                    for k in ("id", "account_id", "display_name", "role", "team", "buddy_id")
                ),
            )
        for task in data["tasks"]:
            connection.execute(
                "INSERT INTO app.tasks "
                "(id,intern_id,title,description,status,position,source_ids) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                tuple(
                    task[k]
                    for k in ("id", "intern_id", "title", "description", "status", "position")
                )
                + (Jsonb(task["source_ids"]),),
            )
        # SET LOCAL ROLE cannot switch directly from app_owner; reset as admin first.
        connection.execute("RESET ROLE")
        connection.execute("SET LOCAL ROLE kb_owner")
        for doc in data["documents"]:
            content = (ROOT / doc["path"]).read_text(encoding="utf-8")
            connection.execute(
                "INSERT INTO kb.documents "
                "(id,title,content,version,content_hash,visibility,synthetic) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                (
                    doc["id"],
                    doc["title"],
                    content,
                    doc["version"],
                    hashlib.sha256(content.encode("utf-8")).hexdigest(),
                    doc["visibility"],
                    doc["synthetic"],
                ),
            )
    print("Synthetic seed loaded; existing progress preserved; no embeddings generated.")


if __name__ == "__main__":
    main()
