package handlers

import "time"

// defaultProbeTimeout is the deadline for synchronous credential probes during
// account creation. Binance can be slow under throttling; 8s gives us margin
// without making the UI feel locked.
func defaultProbeTimeout() time.Duration { return 8 * time.Second }
