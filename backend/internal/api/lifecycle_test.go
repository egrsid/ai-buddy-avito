package api

import (
	"context"
	"net"
	"net/http"
	"sync/atomic"
	"testing"
	"time"
)

func TestServeDrainsRequestsAndBackgroundBeforeReturning(t *testing.T) {
	s := &Server{}
	var finished, background atomic.Bool
	started := make(chan struct{})
	listener, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	addr := listener.Addr().String()
	listener.Close()
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.Background(func() { time.Sleep(150 * time.Millisecond); background.Store(true) })
		close(started)
		time.Sleep(150 * time.Millisecond)
		finished.Store(true)
		w.WriteHeader(204)
	})
	stop, cancel := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() {
		served <- s.Serve(stop, &http.Server{Addr: addr, Handler: handler}, func() (context.Context, context.CancelFunc) {
			return context.WithTimeout(context.Background(), 2*time.Second)
		})
	}()
	go func() {
		for i := 0; i < 100; i++ {
			if r, err := http.Get("http://" + addr); err == nil {
				r.Body.Close()
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
	}()
	<-started
	cancel()
	if e := <-served; e != nil {
		t.Fatal(e)
	}
	if !finished.Load() || !background.Load() {
		t.Fatal("Serve returned before the in-flight request and background work finished")
	}
}

func TestWaitBackgroundTimesOut(t *testing.T) {
	s := &Server{}
	release := make(chan struct{})
	s.Background(func() { <-release })
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if s.WaitBackground(ctx) {
		t.Fatal("expected timeout while work is running")
	}
	close(release)
	if !s.WaitBackground(context.Background()) {
		t.Fatal("expected completion")
	}
}

func TestServeReportsListenErrors(t *testing.T) {
	s := &Server{}
	err := s.Serve(context.Background(), &http.Server{Addr: "256.0.0.1:1"}, nil)
	if err == nil {
		t.Fatal("expected listen error")
	}
}
