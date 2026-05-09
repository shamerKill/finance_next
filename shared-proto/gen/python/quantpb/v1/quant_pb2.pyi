import datetime

from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class IngestRequest(_message.Message):
    __slots__ = ("exchange", "symbol", "timeframe", "start", "end")
    EXCHANGE_FIELD_NUMBER: _ClassVar[int]
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_FIELD_NUMBER: _ClassVar[int]
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    exchange: str
    symbol: str
    timeframe: str
    start: _timestamp_pb2.Timestamp
    end: _timestamp_pb2.Timestamp
    def __init__(self, exchange: _Optional[str] = ..., symbol: _Optional[str] = ..., timeframe: _Optional[str] = ..., start: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., end: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class IngestAck(_message.Message):
    __slots__ = ("run_id", "bars_ingested", "from_ts", "to_ts")
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    BARS_INGESTED_FIELD_NUMBER: _ClassVar[int]
    FROM_TS_FIELD_NUMBER: _ClassVar[int]
    TO_TS_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    bars_ingested: int
    from_ts: _timestamp_pb2.Timestamp
    to_ts: _timestamp_pb2.Timestamp
    def __init__(self, run_id: _Optional[str] = ..., bars_ingested: _Optional[int] = ..., from_ts: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., to_ts: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class BacktestRequest(_message.Message):
    __slots__ = ("strategy_id", "exchange", "symbol", "timeframe", "start", "end", "params_json")
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    EXCHANGE_FIELD_NUMBER: _ClassVar[int]
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_FIELD_NUMBER: _ClassVar[int]
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    PARAMS_JSON_FIELD_NUMBER: _ClassVar[int]
    strategy_id: str
    exchange: str
    symbol: str
    timeframe: str
    start: _timestamp_pb2.Timestamp
    end: _timestamp_pb2.Timestamp
    params_json: str
    def __init__(self, strategy_id: _Optional[str] = ..., exchange: _Optional[str] = ..., symbol: _Optional[str] = ..., timeframe: _Optional[str] = ..., start: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., end: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., params_json: _Optional[str] = ...) -> None: ...

class BacktestHandle(_message.Message):
    __slots__ = ("run_id",)
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    def __init__(self, run_id: _Optional[str] = ...) -> None: ...

class GetBacktestStatusRequest(_message.Message):
    __slots__ = ("run_id",)
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    def __init__(self, run_id: _Optional[str] = ...) -> None: ...

class BacktestStatus(_message.Message):
    __slots__ = ("run_id", "state", "progress", "error")
    class State(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        STATE_UNSPECIFIED: _ClassVar[BacktestStatus.State]
        PENDING: _ClassVar[BacktestStatus.State]
        RUNNING: _ClassVar[BacktestStatus.State]
        SUCCEEDED: _ClassVar[BacktestStatus.State]
        FAILED: _ClassVar[BacktestStatus.State]
    STATE_UNSPECIFIED: BacktestStatus.State
    PENDING: BacktestStatus.State
    RUNNING: BacktestStatus.State
    SUCCEEDED: BacktestStatus.State
    FAILED: BacktestStatus.State
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    state: BacktestStatus.State
    progress: float
    error: str
    def __init__(self, run_id: _Optional[str] = ..., state: _Optional[_Union[BacktestStatus.State, str]] = ..., progress: _Optional[float] = ..., error: _Optional[str] = ...) -> None: ...

class OptimizationRequest(_message.Message):
    __slots__ = ("strategy_id", "exchange", "symbol", "timeframe", "start", "end", "study_config_json")
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    EXCHANGE_FIELD_NUMBER: _ClassVar[int]
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_FIELD_NUMBER: _ClassVar[int]
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    STUDY_CONFIG_JSON_FIELD_NUMBER: _ClassVar[int]
    strategy_id: str
    exchange: str
    symbol: str
    timeframe: str
    start: _timestamp_pb2.Timestamp
    end: _timestamp_pb2.Timestamp
    study_config_json: str
    def __init__(self, strategy_id: _Optional[str] = ..., exchange: _Optional[str] = ..., symbol: _Optional[str] = ..., timeframe: _Optional[str] = ..., start: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., end: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., study_config_json: _Optional[str] = ...) -> None: ...

class StudyHandle(_message.Message):
    __slots__ = ("study_id",)
    STUDY_ID_FIELD_NUMBER: _ClassVar[int]
    study_id: str
    def __init__(self, study_id: _Optional[str] = ...) -> None: ...

class EvaluateRequest(_message.Message):
    __slots__ = ("strategy_id", "exchange", "symbol", "timeframe", "ts")
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    EXCHANGE_FIELD_NUMBER: _ClassVar[int]
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_FIELD_NUMBER: _ClassVar[int]
    TS_FIELD_NUMBER: _ClassVar[int]
    strategy_id: str
    exchange: str
    symbol: str
    timeframe: str
    ts: _timestamp_pb2.Timestamp
    def __init__(self, strategy_id: _Optional[str] = ..., exchange: _Optional[str] = ..., symbol: _Optional[str] = ..., timeframe: _Optional[str] = ..., ts: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class SignalDecision(_message.Message):
    __slots__ = ("action", "size", "reason")
    class Action(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        ACTION_UNSPECIFIED: _ClassVar[SignalDecision.Action]
        HOLD: _ClassVar[SignalDecision.Action]
        OPEN_LONG: _ClassVar[SignalDecision.Action]
        OPEN_SHORT: _ClassVar[SignalDecision.Action]
        CLOSE: _ClassVar[SignalDecision.Action]
        ADD_POSITION: _ClassVar[SignalDecision.Action]
    ACTION_UNSPECIFIED: SignalDecision.Action
    HOLD: SignalDecision.Action
    OPEN_LONG: SignalDecision.Action
    OPEN_SHORT: SignalDecision.Action
    CLOSE: SignalDecision.Action
    ADD_POSITION: SignalDecision.Action
    ACTION_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    action: SignalDecision.Action
    size: float
    reason: str
    def __init__(self, action: _Optional[_Union[SignalDecision.Action, str]] = ..., size: _Optional[float] = ..., reason: _Optional[str] = ...) -> None: ...
