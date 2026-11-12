"""Точка входа uvicorn: app.main:app. Логика — в app.api и других модулях."""

import logging
import os

from app.api import create_app
from app.config import load_settings

# Без этого предупреждения провайдера (обрезка промпта, прогрев) не видны в логах контейнера.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
app = create_app(load_settings(os.environ))
