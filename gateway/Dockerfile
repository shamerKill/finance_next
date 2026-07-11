# Multi-stage Go build for the finance_next gateway.
#
# Stage 1 builds a static binary against the pinned Go toolchain. Stage 2
# is a minimal alpine image that just runs the binary; no Go toolchain
# ships to production.
#
# Build context is the REPO ROOT (see infra/docker-compose.yml) so we can
# COPY both gateway/ and shared-proto/gen/go for generated stubs.

# ---- builder ---------------------------------------------------------------
FROM golang:1.25-alpine AS builder

WORKDIR /workspace
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}

# Install git for `go mod download` to fetch private deps if any. Cheap.
RUN apk add --no-cache git

# Pre-cache modules — only re-run when go.{mod,sum} change.
COPY gateway/go.mod gateway/go.sum ./gateway/
COPY shared-proto/ ./shared-proto/
WORKDIR /workspace/gateway
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Now copy sources and build.
COPY gateway/ ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/gateway \
    ./cmd/gateway

# ---- runtime ---------------------------------------------------------------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S app && adduser -S app -G app
# Note: BusyBox in alpine ships `wget` by default — used by the
# docker-compose healthcheck against /healthz. No extra package needed.

USER app
WORKDIR /app
COPY --from=builder /out/gateway /app/gateway

EXPOSE 3001
ENTRYPOINT ["/app/gateway"]
