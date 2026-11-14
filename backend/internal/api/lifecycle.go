package api

import (
	"context"
	"errors"
	"net/http"
)

// Background runs after-commit work (AI enrichment, revision generation) so that shutdown
// can wait for it before the database pool is closed.
func (s *Server) Background(work func()) {
	s.background.Add(1)
	go func() {
		defer s.background.Done()
		work()
	}()
}

// WaitBackground blocks until background work finishes or ctx ends; false means it timed out.
func (s *Server) WaitBackground(ctx context.Context) bool {
	done := make(chan struct{})
	go func() {
		s.background.Wait()
		close(done)
	}()
	select {
	case <-done:
		return true
	case <-ctx.Done():
		return false
	}
}

// Serve runs the HTTP server until stop ends, then drains in-flight requests and background
// work before returning, so the caller may close the database pool afterwards. ListenAndServe
// returns as soon as Shutdown starts, therefore the drain is awaited explicitly.
func (s *Server) Serve(stop context.Context, server *http.Server, drain func() (context.Context, context.CancelFunc)) error {
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		<-stop.Done()
		ctx, cancel := drain()
		defer cancel()
		_ = server.Shutdown(ctx)
		s.WaitBackground(ctx)
	}()
	e := server.ListenAndServe()
	if e != nil && !errors.Is(e, http.ErrServerClosed) {
		return e
	}
	<-drained
	return nil
}
