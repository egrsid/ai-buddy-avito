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
