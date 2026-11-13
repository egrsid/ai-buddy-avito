// Package main wires PostgreSQL, the API and the bounded recovery loop.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ai-buddy/backend/internal/api"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	pool, e := pgxpool.New(ctx, "")
	if e != nil {
		log.Fatal(e)
	}
	defer pool.Close()
	contracts := os.Getenv("CONTRACTS_DIR")
	if contracts == "" {
		contracts = "contracts/v2"
	}
	server, e := api.New(pool, api.Config{Env: os.Getenv("APP_ENV"), Origin: os.Getenv("APP_ORIGIN"), Token: os.Getenv("INTERNAL_API_TOKEN"), AIURL: os.Getenv("AI_BASE_URL"), MockURL: os.Getenv("MOCK_BASE_URL"), Contracts: contracts, ContractsV3: os.Getenv("CONTRACTS_V3_DIR")})
	if e != nil {
		log.Fatal(e)
	}
	if e = server.Recover(ctx); e != nil {
		log.Fatal("database recovery failed")
	}
	go server.Maintain(ctx)
	httpServer := &http.Server{Addr: ":8080", Handler: server.Handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdown)
	}()
	if e = httpServer.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		log.Fatal(e)
	}
}
