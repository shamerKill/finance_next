"""Common error types for Phase 8 data sources.

`ErrAPIKeyNotConfigured` is raised by paid-source stubs (Glassnode,
Nansen, Polygon.io) and any client whose API key env var is required
but unset. We use a distinct exception class — rather than overloading
:class:`RuntimeError` — so callers can catch it without swallowing
genuine bugs.

The message format includes both the source name and the exact env
variable to set; that's the single most asked-for detail when
operators hit this in production logs.
"""

from __future__ import annotations


class ErrAPIKeyNotConfigured(RuntimeError):
    """Raised when a data source needs an API key that wasn't configured.

    Parameters
    ----------
    source:
        Human-readable source name (``glassnode``, ``etherscan``, ``fred``).
    env_var:
        The exact environment variable the operator should set.
    """

    def __init__(self, source: str, env_var: str) -> None:
        super().__init__(f"{source}: env {env_var} not set")
        self.source = source
        self.env_var = env_var
