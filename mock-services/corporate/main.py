"""Wire the separate corporate service using its restricted PostgreSQL role."""

from corporate.service import create_app

app = create_app()
