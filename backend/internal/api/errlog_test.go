package api

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestErrorClassHasNoMessageText(t *testing.T) {
	secret := "password=hunter2"
	got := errorClass(fmt.Errorf("query %s: %w", secret, &pgconn.PgError{Code: "40001", Message: secret}))
	if !strings.Contains(got, "sqlstate=40001") || strings.Contains(got, "hunter2") || !strings.Contains(got, "*pgconn.PgError") {
		t.Fatal(got)
	}
	got = errorClass(fmt.Errorf("read: %w", context.Canceled))
	if !strings.Contains(got, "canceled=true") || strings.Contains(got, "deadline") {
		t.Fatal(got)
	}
	if got = errorClass(fmt.Errorf("x: %w", context.DeadlineExceeded)); !strings.Contains(got, "deadline=true") {
		t.Fatal(got)
	}
}

func TestRouteInfoForLogs(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	active := activeRoute{"GET /api/v3/goals", ctx}
	if routeName(active) != "GET /api/v3/goals" || clientGone(active) || routeName(nil) != "" || clientGone(nil) {
		t.Fatal("route info")
	}
	cancel()
	if !clientGone(active) {
		t.Fatal("aborted request must be recognised")
	}
}
