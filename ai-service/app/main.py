"""Точка входа uvicorn: app.main:app. Логика — в app.api и других модулях."""

import os

from app.api import create_app
from app.config import load_settings

app = create_app(load_settings(os.environ))
