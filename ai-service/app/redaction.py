"""Вычистка секретов и контактов из свободного текста перед моделью и в сводках.

Не идеальный DLP, а страховка: пароли в DSN, ключи вида key=value, длинные токены,
email и телефоны заменяются метками.
"""

import re

PATTERNS = [
    # postgres://user:password@host -> postgres://user:[скрыто]@host
    (re.compile(r"(\b[a-z][a-z0-9+.-]*://[^\s:/@]+:)[^\s@]+@", re.IGNORECASE), r"\1[скрыто]@"),
    (
        re.compile(
            r"\b(password|passwd|pwd|пароль|token|токен|secret|api[_-]?key)(\s*[:=]\s*)\S+",
            re.IGNORECASE,
        ),
        r"\1\2[скрыто]",
    ),
    (re.compile(r"\bBearer\s+\S+", re.IGNORECASE), "Bearer [скрыто]"),
    (re.compile(r"\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b"), "[email скрыт]"),
    # Телефон в российском формате: +7/8, затем 10 цифр с пробелами, скобками, дефисами.
    # Даты (2026-11-11) и порты сюда не попадают.
    (
        re.compile(r"(?<!\w)(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\w)"),
        "[телефон скрыт]",
    ),
    # Длинные случайные строки похожи на ключи и токены.
    (re.compile(r"\b[A-Za-z0-9_\-]{32,}\b"), "[скрыто]"),
]


def redact(text: str) -> str:
    for pattern, replacement in PATTERNS:
        text = pattern.sub(replacement, text)
    return text
