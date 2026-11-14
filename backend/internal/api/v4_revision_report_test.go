package api

import (
	"strings"
	"testing"
)

func TestRevisionReportIsBoundedAggregate(t *testing.T) {
	low := revisionReport(Object{"section_id": "goal", "reason": "outcome_unclear", "lifetime_count": 1, "hypothesis": "  "})
	if low["affected_count"] != 2 || low["hypothesis"] != nil || len(low) != 3 {
		t.Fatal(low)
	}
	high := revisionReport(Object{"section_id": "goal", "reason": "outcome_unclear", "lifetime_count": 500, "hypothesis": strings.Repeat("я", 2500), "owner_id": internA})
	if high["affected_count"] != 100 || len([]rune(str(high["hypothesis"]))) != 2000 || high["owner_id"] != nil {
		t.Fatal(high)
	}
	normal := revisionReport(Object{"section_id": "report-format", "reason": "requirement_unclear", "lifetime_count": 6, "hypothesis": "Раздел общий."})
	if normal["affected_count"] != 6 || normal["hypothesis"] != "Раздел общий." {
		t.Fatal(normal)
	}
}
