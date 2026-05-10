"""On-chain metric sources (Phase 8).

Free
----
* :class:`DefiLlamaClient` — TVL + protocol metadata, no key.
* :class:`EtherscanClient` — ETH supply / gas; needs ``ETHERSCAN_API_KEY``.
* :class:`BlockchainInfoClient` — BTC chain stats, no key.

Paid stubs (raise :class:`quant.data.errors.ErrAPIKeyNotConfigured`)
-------------------------------------------------------------------
* :class:`GlassnodeStub` — needs ``GLASSNODE_API_KEY``
* :class:`NansenStub`    — needs ``NANSEN_API_KEY``

Storage: ``onchain_metrics(source, chain, metric, ts, value)``.
"""

from quant.data.onchain.blockchain_info import (  # noqa: F401
    BlockchainInfoClient,
    OnchainPoint,
)
from quant.data.onchain.defillama import DefiLlamaClient  # noqa: F401
from quant.data.onchain.etherscan import EtherscanClient  # noqa: F401
from quant.data.onchain.glassnode_stub import GlassnodeStub  # noqa: F401
from quant.data.onchain.nansen_stub import NansenStub  # noqa: F401
