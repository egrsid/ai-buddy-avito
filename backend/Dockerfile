FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
COPY backend/ ./
RUN GODEBUG=http2client=0 CGO_ENABLED=0 go build -o /api ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && adduser -D app
USER app
COPY --from=build /api /api
COPY --chown=app:app contracts/v2/ /contracts/v2/
ENV CONTRACTS_DIR=/contracts/v2
EXPOSE 8080
CMD ["/api"]
