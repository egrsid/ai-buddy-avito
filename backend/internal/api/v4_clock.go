package api

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

type demoClockState struct {
	Synthetic bool      `json:"synthetic"`
	Dataset   string    `json:"dataset"`
	Now       time.Time `json:"now"`
}

// Only an explicitly configured local/test process can use an operator-owned clock.
// There is no HTTP setter. Invalid/rewound files freeze time instead of aging data.
func localDemoClock(env, path string) (func() time.Time, error) {
	if env != "local" && env != "test" {
		return nil, fmt.Errorf("synthetic clock requires local/test environment")
	}
	read := func() (time.Time, error) {
		data, e := os.ReadFile(path)
		if e != nil {
			return time.Time{}, e
		}
		var state demoClockState
		if json.Unmarshal(data, &state) != nil || !state.Synthetic || state.Dataset != "v4-cohorts-v1" || state.Now.IsZero() {
			return time.Time{}, fmt.Errorf("invalid synthetic clock")
		}
		return state.Now.UTC(), nil
	}
	last, e := read()
	if e != nil {
		return nil, e
	}
	var mu sync.Mutex
	return func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		if next, e := read(); e == nil && !next.Before(last) {
			last = next
		}
		return last
	}, nil
}
