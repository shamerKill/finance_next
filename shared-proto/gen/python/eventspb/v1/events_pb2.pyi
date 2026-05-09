import datetime

from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
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

class BacktestProgress(_message.Message):
    __slots__ = ("run_id", "progress", "recent_equity", "state")
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    RECENT_EQUITY_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    progress: float
    recent_equity: _containers.RepeatedScalarFieldContainer[float]
    state: int
    def __init__(self, run_id: _Optional[str] = ..., progress: _Optional[float] = ..., recent_equity: _Optional[_Iterable[float]] = ..., state: _Optional[int] = ...) -> None: ...

class BacktestCompleted(_message.Message):
    __slots__ = ("run_id", "strategy_id", "metrics", "state", "error_message", "finished_at")
    class MetricsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: float
        def __init__(self, key: _Optional[str] = ..., value: _Optional[float] = ...) -> None: ...
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    METRICS_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    FINISHED_AT_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    strategy_id: str
    metrics: _containers.ScalarMap[str, float]
    state: int
    error_message: str
    finished_at: _timestamp_pb2.Timestamp
    def __init__(self, run_id: _Optional[str] = ..., strategy_id: _Optional[str] = ..., metrics: _Optional[_Mapping[str, float]] = ..., state: _Optional[int] = ..., error_message: _Optional[str] = ..., finished_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...
