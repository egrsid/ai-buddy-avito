"""Explicit additional synthetic actors only for the separate v4 cohort-clock dataset."""


def cohort_id(number: int) -> str:
    if not 1 <= number <= 20:
        raise ValueError("cohort participant must be 1..20")
    return f"70000000-0000-4000-8000-{number:012d}"


def seed_cohorts(connection):
    connection.execute("SET LOCAL ROLE app_owner")
    buddy = connection.execute("SELECT id FROM app.users WHERE account_id='buddy-a'").fetchone()[0]
    for number in range(1, 21):
        identifier = cohort_id(number)
        row = connection.execute(
            "INSERT INTO app.users(id,account_id,display_name,role,team,buddy_id) "
            "VALUES (%s,%s,%s,'intern','team-a',%s) ON CONFLICT DO NOTHING RETURNING id",
            (identifier, f"cohort-{number:02d}", f"Synthetic cohort {number:02d}", buddy),
        ).fetchone()
        if not row:
            continue  # Never restore revoked roles/permissions on seed replay.
        connection.execute("INSERT INTO app.role_assignments VALUES (%s,'intern')", (identifier,))
        connection.execute(
            "INSERT INTO app.resource_assignments VALUES (%s,'db-team-a-test','db_reader')",
            (identifier,),
        )
        connection.execute(
            "INSERT INTO app.document_permissions(document_id,subject_id,permission) "
            "SELECT document_id,%s,permission FROM app.document_permissions "
            "WHERE subject_id=(SELECT id FROM app.users WHERE account_id='intern-a')",
            (identifier,),
        )
    connection.execute("RESET ROLE")
