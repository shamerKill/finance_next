# shared-proto

Single source of truth for finance_next inter-service contracts.

## Layout

```
shared-proto/
├── quant/v1/quant.proto      # gRPC service: gateway → quant worker
├── events/v1/events.proto    # Redis Stream payload schemas
├── buf.yaml + buf.gen.yaml   # buf config (Go codegen)
├── gen-python.sh             # grpc_tools wrapper for Python codegen
└── gen/
    ├── go/                   # checked-in Go stubs
    └── python/               # checked-in Python stubs
```

## Toolchain

- [`buf`](https://buf.build) — proto linting, breaking-change check, Go codegen
- `protoc-gen-go` — `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`
- `protoc-gen-go-grpc` — `go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest`
- `grpcio-tools` — `pip install grpcio-tools` (for Python; bundled with quant `uv sync`)

## Regenerating

```bash
cd shared-proto

# Go (lints + generates gen/go/)
buf generate

# Python (uses grpc_tools.protoc; needs grpcio-tools in active env)
./gen-python.sh
```

The `gen/` tree is committed so downstream services (Go gateway, Python quant)
don't need a proto toolchain at build time. Always commit regenerated stubs
alongside the .proto change.
