import pytest

from scripts.go_coverage import line_coverage


@pytest.mark.parametrize(
    ("profile", "expected"),
    [
        ("mode: atomic\np/a.go:1.1,5.2 2 1\np/a.go:5.2,7.2 1 0\n", (4, 7)),
        ("mode: set\np/a.go:1.1,3.1 1 1\n", (2, 2)),
        ("mode: set\np/a.go:1.1,2.3 0 0\n", (0, 0)),
        ("mode: set\na.go:1.1,1.8 1 1\nb.go:1.1,1.8 1 0\n", (1, 2)),
    ],
)
def test_line_metric_preserves_uncovered_overlapping_blocks(profile, expected):
    assert line_coverage(profile) == expected
