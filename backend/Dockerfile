FROM golang:1.27.4-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /api ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && adduser -D app
USER app
COPY --from=build /api /api
EXPOSE 8080
CMD ["/api"]
