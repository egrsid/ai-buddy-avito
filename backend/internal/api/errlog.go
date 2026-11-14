package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/pgconn"
)

// activeRoutes maps a request ID to its route pattern while the request runs, for error logs.
var activeRoutes sync.Map

// errorClass describes an unexpected error for logs without its text: wrapper types,
// SQLSTATE and cancellation only, so no SQL arguments, user input or secrets get logged.
func errorClass(e error) string {
	parts := []string{}
	for current := e; current != nil && len(parts) < 6; current = errors.Unwrap(current) {
		parts = append(parts, fmt.Sprintf("%T", current))
	}
	out := "chain=" + strings.Join(parts, ">")
	var pg *pgconn.PgError
	if errors.As(e, &pg) {
		out += " sqlstate=" + pg.Code
	}
	if errors.Is(e, context.Canceled) {
		out += " canceled=true"
	}
	if errors.Is(e, context.DeadlineExceeded) {
		out += " deadline=true"
	}
	return out
}
