package api

import (
	"context"
	"net/http"
	"sync"
	"testing"
	"time"
)

// Browsers abort list reads on navigation. An aborted request must never leave a pooled
// connection busy for the next, unrelated request.
func TestCanceledGoalListsDoNotBreakLaterRequests(t *testing.T) {
	f := newFixture(t)
	intern := f.browser("intern-a")
	intern.goal()
	cookies := intern.client.Jar
	var wg sync.WaitGroup
	for i := 0; i < 60; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), time.Duration(200+i*37%3000)*time.Microsecond)
			defer cancel()
			req, _ := http.NewRequestWithContext(ctx, "GET", f.url+"/api/v3/goals", nil)
			res, err := (&http.Client{Jar: cookies}).Do(req)
			if err == nil {
				res.Body.Close()
			}
		}(i)
	}
	wg.Wait()
	for i := 0; i < 40; i++ {
		res := intern.raw("GET", "/api/v3/goals", nil, nil)
		res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatalf("request %d after canceled reads: %d", i, res.StatusCode)
		}
	}
}

// The goal list rechecks IAM for verified goals inside per-goal savepoints, and writes a fresh
// check when the grant is gone. Aborted reads on both paths must not poison later requests.
func TestCanceledVerifiedGoalListsDoNotBreakLaterRequests(t *testing.T) {
	f := newFixture(t)
	intern := f.browser("intern-a")
	f.setGrant(internA, true)
	g := intern.goal()
	intern.check(g, "check_connection", "require", 201)
	for _, granted := range []bool{true, false} {
		f.setGrant(internA, granted)
		var wg sync.WaitGroup
		for i := 0; i < 80; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				ctx, cancel := context.WithTimeout(context.Background(), time.Duration(300+i*53%6000)*time.Microsecond)
				defer cancel()
				req, _ := http.NewRequestWithContext(ctx, "GET", f.url+"/api/v3/goals", nil)
				res, err := (&http.Client{Jar: intern.client.Jar}).Do(req)
				if err == nil {
					res.Body.Close()
				}
			}(i)
		}
		wg.Wait()
		for i := 0; i < 30; i++ {
			res := intern.raw("GET", "/api/v3/goals", nil, nil)
			res.Body.Close()
			if res.StatusCode != 200 {
				t.Fatalf("granted=%v request %d after canceled reads: %d", granted, i, res.StatusCode)
			}
		}
	}
}
