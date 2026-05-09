import datetime

from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class OhlcvIngested(_message.Message):
    __slots__ = ("exchange", "symbol", "timeframe", "from_ts", "to_ts", "bars_ingested", "run_id")
    EXCHANGE_FIELD_NUMBER: _ClassVar[int]
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_FIELD_NUMBER: _ClassVar[int]
    FROM_TS_FIELD_NUMBER: _ClassVar[int]
    TO_TS_FIELD_NUMBER: _ClassVar[int]
    BARS_INGESTED_FIELD_NUMBER: _ClassVar[int]
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    exchange: str
    symbol: str
    timeframe: str
    from_ts: _timestamp_pb2.Timestamp
    to_ts: _timestamp_pb2.Timestamp
    bars_ingested: int
    run_id: str
    def __init__(self, exchange: _Optional[str] = ..., symbol: _Optional[str] = ..., timeframe: _Optional[str] = ..., from_ts: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., to_ts: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., bars_ingested: _Optional[int] = ..., run_id: _Optional[str] = ...) -> None: ...

class StrategyUpserted(_message.Message):
    __slots__ = ("strategy_id", "version", "kind")
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    strategy_id: str
    version: int
    kind: str
    def __init__(self, strategy_id: _Optional[str] = ..., version: _Optional[int] = ..., kind: _Optional[str] = ...) -> None: ...
