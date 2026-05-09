#!/usr/bin/env bash
# Generate Python protobuf + gRPC stubs into gen/python/.
#
# buf doesn't bundle a Python plugin so we drive grpc_tools.protoc directly.
# Run from the shared-proto/ directory.
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/gen/python"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$OUT_DIR"

# python3 -m grpc_tools.protoc compiles both message classes and grpc stubs.
# --proto_path=$ROOT_DIR keeps the generated import paths package-relative
# (quant/v1/..., events/v1/...).
python3 -m grpc_tools.protoc \
    --proto_path="$ROOT_DIR" \
    --python_out="$OUT_DIR" \
    --grpc_python_out="$OUT_DIR" \
    --pyi_out="$OUT_DIR" \
    "$ROOT_DIR/quantpb/v1/quant.proto" \
    "$ROOT_DIR/eventspb/v1/events.proto"

# grpc_tools emits absolute imports (e.g. `from quant.v1 import quant_pb2`).
# Add empty package markers so the gen/python tree is importable as-is.
find "$OUT_DIR" -type d -exec touch {}/__init__.py \;

echo "Python stubs generated under $OUT_DIR"
