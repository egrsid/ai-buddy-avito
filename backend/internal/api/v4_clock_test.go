package api

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSyntheticClockIsExplicitLocalAndNeverRewinds(t *testing.T) {
	file := filepath.Join(t.TempDir(), "clock.json")
	write := func(at string) {
		t.Helper()
		if e := os.WriteFile(file, []byte(`{"synthetic":true,"dataset":"v4-cohorts-v1","now":"`+at+`"}`), 0600); e != nil {
			t.Fatal(e)
		}
	}
	write("2026-11-01T00:00:00Z")
	if _, e := localDemoClock("production", file); e == nil {
		t.Fatal("production clock allowed")
	}
	clock, e := localDemoClock("test", file)
	if e != nil {
		t.Fatal(e)
	}
	first := clock()
	write("2026-11-09T00:00:00Z")
	advanced := clock()
	if advanced.Sub(first) != 8*24*time.Hour {
		t.Fatal("clock did not advance")
	}
	write("2026-11-01T00:00:00Z")
	if clock() != advanced {
		t.Fatal("clock rewind allowed")
	}
	_ = os.WriteFile(file, []byte("broken"), 0600)
	if clock() != advanced {
		t.Fatal("invalid clock fell back to real time")
	}
	if _, e = localDemoClock("test", file); e == nil {
		t.Fatal("invalid initial clock accepted")
	}
	if _, e = localDemoClock("local", file+"missing"); e == nil {
		t.Fatal("missing clock accepted")
	}
}
