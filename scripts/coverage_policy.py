"""One component line-coverage policy; no aggregation or rounded threshold checks."""

MIN_LINE_PERCENT = 82


def meets_line_threshold(covered: int, total: int) -> bool:
    if total <= 0 or covered < 0 or covered > total:
        return False
    return covered * 100 >= total * MIN_LINE_PERCENT
