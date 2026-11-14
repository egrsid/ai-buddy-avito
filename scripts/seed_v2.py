"""Explicit synthetic v2 dataset. Refuse to silently reassign existing v1 users."""

import json
from pathlib import Path

from psycopg.types.json import Jsonb

from scripts.seed_v3 import seed_v3

ROOT = Path(__file__).resolve().parents[1]


def seed(connection):
    data = json.loads((ROOT / "data/seed/demo-v2.json").read_text(encoding="utf-8"))
    # Additional synthetic interns for distinct-participant statistics and ACL rehearsal.
    prototype = next(u for u in data["users"] if u["account_id"] == "intern-a")
    for index, suffix in enumerate("defghi", start=20):
        data["users"].append(
            {
                **prototype,
                "id": f"10000000-0000-4000-8000-{index:012d}",
                "account_id": f"intern-{suffix}",
                "display_name": f"Стажёр {index - 17} · команда A",
            }
        )
    journey = json.loads((ROOT / "data/seed/journey-db-v2.json").read_text(encoding="utf-8"))
    connection.execute("SET LOCAL ROLE app_owner")
    for user in sorted(data["users"], key=lambda u: u["role"] == "intern"):
        row = connection.execute(
            "SELECT team,buddy_id FROM app.users WHERE id=%s", (user["id"],)
        ).fetchone()
        if row and (row[0] != user["team"] or str(row[1] or "") != (user["buddy_id"] or "")):
            raise ValueError(
                "v2 seed conflicts with existing user assignments: use a fresh demo DB"
            )
        connection.execute(
            "INSERT INTO app.users(id,account_id,display_name,role,team,buddy_id) "
            "VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            tuple(
                user[k] for k in ("id", "account_id", "display_name", "role", "team", "buddy_id")
            ),
        )
        # Re-running seed must not restore intentionally revoked roles/ACL assignments.
        if row:
            continue
        connection.execute(
            "INSERT INTO app.role_assignments VALUES (%s,%s) ON CONFLICT DO NOTHING",
            (user["id"], user["role"]),
        )
        resource = "db-team-a-test" if user["team"] == "team-a" else "db-team-b-test"
        connection.execute(
            "INSERT INTO app.resource_assignments VALUES (%s,%s,'db_reader') ON CONFLICT "
            "DO NOTHING",
            (user["id"], resource),
        )
        for document in data["documents"]:
            key = document["key"]
            readable = (
                key == "public"
                or (user["team"] == "team-a" and key in ("connection-a", "request-a"))
                or (user["team"] == "team-b" and key == "team-b")
            )
            if readable:
                connection.execute(
                    "INSERT INTO app.document_permissions VALUES (%s,%s,'knowledge.read') ON "
                    "CONFLICT DO NOTHING",
                    (document["id"], user["id"]),
                )
            if user["role"] == "documentation_owner" and key == "connection-a":
                connection.execute(
                    "INSERT INTO app.document_permissions VALUES (%s,%s,'knowledge_gap.review') "
                    "ON CONFLICT DO NOTHING",
                    (document["id"], user["id"]),
                )
    for resource in data["resources"]:
        approver = "10000000-0000-4000-8000-000000000006"
        inserted = connection.execute(
            "INSERT INTO app.resource_policies VALUES (%s,%s,%s,%s,%s) "
            "ON CONFLICT DO NOTHING RETURNING resource_id",
            (
                resource["resource_id"],
                resource["team_id"],
                resource["resource_id"],
                Jsonb(resource["requestable_roles"]),
                approver,
            ),
        ).fetchone()
        if inserted and resource["approver_account_id"]:
            connection.execute(
                "INSERT INTO app.resource_approvers VALUES (%s,%s) ON CONFLICT DO NOTHING",
                (resource["resource_id"], approver),
            )
    connection.execute(
        "INSERT INTO app.journey_templates VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
        (
            journey["journey_id"],
            journey["version"],
            journey["team_id"],
            journey["resource_id"],
            journey["approved_by"],
            journey["content_hash"],
            Jsonb(journey),
        ),
    )
    connection.execute("RESET ROLE")
    connection.execute("SET LOCAL ROLE corporate_owner")
    for resource in data["resources"]:
        inserted = connection.execute(
            "INSERT INTO corporate.resources VALUES (%s,%s,%s,%s,true) "
            "ON CONFLICT DO NOTHING RETURNING resource_id",
            (
                resource["resource_id"],
                resource["team_id"],
                resource["resource_id"],
                Jsonb(resource["requestable_roles"]),
            ),
        ).fetchone()
        if inserted and resource["approver_account_id"]:
            connection.execute(
                "INSERT INTO corporate.resource_approvers VALUES (%s,%s) ON CONFLICT DO NOTHING",
                (resource["resource_id"], "10000000-0000-4000-8000-000000000006"),
            )
    connection.execute("RESET ROLE")
    seed_v3(connection)
    print(
        "Synthetic v2 app/corporate seed loaded; existing progress and grants "
        "preserved; KB is AI-owned."
    )
