"""Conservative line metric derived from Go's statement-block coverage profile."""


def line_coverage(profile: str) -> tuple[int, int]:
    lines: dict[tuple[str, int], bool] = {}
    for record in profile.splitlines():
        if not record or record.startswith("mode:"):
            continue
        location, statements, hits = record.rsplit(" ", 2)
        if int(statements) == 0:
            continue
        filename, span = location.rsplit(":", 1)
        start, end = span.split(",")
        start_line = int(start.split(".")[0])
        end_line, end_column = map(int, end.split("."))
        if end_column == 1 and end_line > start_line:
            end_line -= 1
        for number in range(start_line, end_line + 1):
            key = (filename, number)
            # A line shared by multiple blocks is covered only if all blocks executed.
            lines[key] = lines.get(key, True) and int(hits) > 0
    return sum(lines.values()), len(lines)
