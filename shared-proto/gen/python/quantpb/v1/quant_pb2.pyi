import datetime

from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class BacktestState(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BACKTEST_STATE_UNSPECIFIED: _ClassVar[BacktestState]
    PENDING: _ClassVar[BacktestState]
    RUNNING: _ClassVar[BacktestState]
    COMPLETED: _ClassVar[BacktestState]
    FAILED: _ClassVar[BacktestState]

class OptimizationState(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    OPTIMIZATION_STATE_UNSPECIFIED: _ClassVar[OptimizationState]
    OPT_PENDING: _ClassVar[OptimizationState]
    OPT_RUNNING: _ClassVar[OptimizationState]
    OPT_COMPLETED: _ClassVar[OptimizationState]
    OPT_FAILED: _ClassVar[OptimizationState]
    OPT_BUDGET_EXCEEDED: _ClassVar[OptimizationState]
BACKTEST_STATE_UNSPECIFIED: BacktestState
PENDING: BacktestState
RUNNING: BacktestState
COMPLETED: BacktestState
FAILED: BacktestState
OPTIMIZATION_STATE_UNSPECIFIED: OptimizationState
OPT_PENDING: OptimizationState
OPT_RUNNING: OptimizationState
OPT_COMPLETED: OptimizationState
OPT_FAILED: OptimizationState
OPT_BUDGET_EXCEEDED: OptimizationState

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
    __slots__ = ("strategy_id", "kind", "params", "symbol", "exchange", "timeframe", "start", "end", "initial_capital", "commission_rate", "slippage_bps")
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    PARAMS_FIELD_NUMBER: _ClassVar[int]
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    EXCHANGE_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_FIELD_NUMBER: _ClassVar[int]
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    INITIAL_CAPITAL_FIELD_NUMBER: _ClassVar[int]
    COMMISSION_RATE_FIELD_NUMBER: _ClassVar[int]
    SLIPPAGE_BPS_FIELD_NUMBER: _ClassVar[int]
    strategy_id: str
    kind: str
    params: _struct_pb2.Struct
    symbol: str
    exchange: str
    timeframe: str
    start: _timestamp_pb2.Timestamp
    end: _timestamp_pb2.Timestamp
    initial_capital: float
    commission_rate: float
    slippage_bps: float
    def __init__(self, strategy_id: _Optional[str] = ..., kind: _Optional[str] = ..., params: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., symbol: _Optional[str] = ..., exchange: _Optional[str] = ..., timeframe: _Optional[str] = ..., start: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., end: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., initial_capital: _Optional[float] = ..., commission_rate: _Optional[float] = ..., slippage_bps: _Optional[float] = ...) -> None: ...

class BacktestHandle(_message.Message):
    __slots__ = ("run_id", "enqueued_at")
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    ENQUEUED_AT_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    enqueued_at: _timestamp_pb2.Timestamp
    def __init__(self, run_id: _Optional[str] = ..., enqueued_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class GetBacktestStatusRequest(_message.Message):
    __slots__ = ("run_id",)
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    def __init__(self, run_id: _Optional[str] = ...) -> None: ...

class BacktestStatus(_message.Message):
    __slots__ = ("run_id", "state", "progress", "metrics", "error_message", "started_at", "finished_at")
    class MetricsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: float
        def __init__(self, key: _Optional[str] = ..., value: _Optional[float] = ...) -> None: ...
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    METRICS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    STARTED_AT_FIELD_NUMBER: _ClassVar[int]
    FINISHED_AT_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    state: BacktestState
    progress: float
    metrics: _containers.ScalarMap[str, float]
    error_message: str
    started_at: _timestamp_pb2.Timestamp
    finished_at: _timestamp_pb2.Timestamp
    def __init__(self, run_id: _Optional[str] = ..., state: _Optional[_Union[BacktestState, str]] = ..., progress: _Optional[float] = ..., metrics: _Optional[_Mapping[str, float]] = ..., error_message: _Optional[str] = ..., started_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., finished_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class BacktestProgress(_message.Message):
    __slots__ = ("run_id", "progress", "recent_equity", "state", "error_message")
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    RECENT_EQUITY_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    run_id: str
    progress: float
    recent_equity: _containers.RepeatedScalarFieldContainer[float]
    state: BacktestState
    error_message: str
    def __init__(self, run_id: _Optional[str] = ..., progress: _Optional[float] = ..., recent_equity: _Optional[_Iterable[float]] = ..., state: _Optional[_Union[BacktestState, str]] = ..., error_message: _Optional[str] = ...) -> None: ...

class OptimizationRequest(_message.Message):
    __slots__ = ("strategy_id", "force", "n_trials_override")
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    FORCE_FIELD_NUMBER: _ClassVar[int]
    N_TRIALS_OVERRIDE_FIELD_NUMBER: _ClassVar[int]
    strategy_id: str
    force: bool
    n_trials_override: int
    def __init__(self, strategy_id: _Optional[str] = ..., force: bool = ..., n_trials_override: _Optional[int] = ...) -> None: ...

class StudyHandle(_message.Message):
    __slots__ = ("study_id", "enqueued_at")
    STUDY_ID_FIELD_NUMBER: _ClassVar[int]
    ENQUEUED_AT_FIELD_NUMBER: _ClassVar[int]
    study_id: str
    enqueued_at: _timestamp_pb2.Timestamp
    def __init__(self, study_id: _Optional[str] = ..., enqueued_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class OptimizationStatus(_message.Message):
    __slots__ = ("study_id", "strategy_id", "state", "trials_completed", "trials_total", "best_value", "current_cost_usd", "error_message", "started_at", "finished_at", "recommendation_id")
    STUDY_ID_FIELD_NUMBER: _ClassVar[int]
    STRATEGY_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    TRIALS_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    TRIALS_TOTAL_FIELD_NUMBER: _ClassVar[int]
    BEST_VALUE_FIELD_NUMBER: _ClassVar[int]
    CURRENT_COST_USD_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    STARTED_AT_FIELD_NUMBER: _ClassVar[int]
    FINISHED_AT_FIELD_NUMBER: _ClassVar[int]
    RECOMMENDATION_ID_FIELD_NUMBER: _ClassVar[int]
    study_id: str
    strategy_id: str
    state: OptimizationState
    trials_completed: int
    trials_total: int
    best_value: float
    current_cost_usd: float
    error_message: str
    started_at: _timestamp_pb2.Timestamp
    finished_at: _timestamp_pb2.Timestamp
    recommendation_id: str
    def __init__(self, study_id: _Optional[str] = ..., strategy_id: _Optional[str] = ..., state: _Optional[_Union[OptimizationState, str]] = ..., trials_completed: _Optional[int] = ..., trials_total: _Optional[int] = ..., best_value: _Optional[float] = ..., current_cost_usd: _Optional[float] = ..., error_message: _Optional[str] = ..., started_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., finished_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., recommendation_id: _Optional[str] = ...) -> None: ...

class OptimizationProgress(_message.Message):
    __slots__ = ("study_id", "trials_completed", "trials_total", "best_value", "state", "current_cost_usd", "error_message")
    STUDY_ID_FIELD_NUMBER: _ClassVar[int]
    TRIALS_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    TRIALS_TOTAL_FIELD_NUMBER: _ClassVar[int]
    BEST_VALUE_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    CURRENT_COST_USD_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    study_id: str
    trials_completed: int
    trials_total: int
    best_value: float
    state: OptimizationState
    current_cost_usd: float
    error_message: str
    def __init__(self, study_id: _Optional[str] = ..., trials_completed: _Optional[int] = ..., trials_total: _Optional[int] = ..., best_value: _Optional[float] = ..., state: _Optional[_Union[OptimizationState, str]] = ..., current_cost_usd: _Optional[float] = ..., error_message: _Optional[str] = ...) -> None: ...

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

class GetAIConfigRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class AIConfigResponse(_message.Message):
    __slots__ = ("define_search_space_prompt", "refine_search_space_prompt", "final_rationale_prompt", "prompts_version", "prompts_hash", "model_family_active", "primary_model_active", "refine_model_active")
    DEFINE_SEARCH_SPACE_PROMPT_FIELD_NUMBER: _ClassVar[int]
    REFINE_SEARCH_SPACE_PROMPT_FIELD_NUMBER: _ClassVar[int]
    FINAL_RATIONALE_PROMPT_FIELD_NUMBER: _ClassVar[int]
    PROMPTS_VERSION_FIELD_NUMBER: _ClassVar[int]
    PROMPTS_HASH_FIELD_NUMBER: _ClassVar[int]
    MODEL_FAMILY_ACTIVE_FIELD_NUMBER: _ClassVar[int]
    PRIMARY_MODEL_ACTIVE_FIELD_NUMBER: _ClassVar[int]
    REFINE_MODEL_ACTIVE_FIELD_NUMBER: _ClassVar[int]
    define_search_space_prompt: str
    refine_search_space_prompt: str
    final_rationale_prompt: str
    prompts_version: str
    prompts_hash: str
    model_family_active: str
    primary_model_active: str
    refine_model_active: str
    def __init__(self, define_search_space_prompt: _Optional[str] = ..., refine_search_space_prompt: _Optional[str] = ..., final_rationale_prompt: _Optional[str] = ..., prompts_version: _Optional[str] = ..., prompts_hash: _Optional[str] = ..., model_family_active: _Optional[str] = ..., primary_model_active: _Optional[str] = ..., refine_model_active: _Optional[str] = ...) -> None: ...

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
