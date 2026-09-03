"""HUNTFLOW Crawler — Per-Host Token Bucket Rate Limiter & Circuit Breaker."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional
from urllib.parse import urlparse

log = logging.getLogger("huntflow-rate-limiter")


class DomainTokenBucket:
    def __init__(self, rps: float = 2.0, burst: int = 5):
        self.rps = max(0.1, rps)
        self.capacity = max(1.0, float(burst))
        self.tokens = self.capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.last_update = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rps)

            if self.tokens < 1.0:
                wait_time = (1.0 - self.tokens) / self.rps
                await asyncio.sleep(wait_time)
                self.tokens = 0.0
                self.last_update = time.monotonic()
            else:
                self.tokens -= 1.0


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_seconds: float = 90.0):
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self.consecutive_failures: dict[str, int] = {}
        self.open_until: dict[str, float] = {}

    def is_open(self, host: str) -> bool:
        now = time.time()
        expiry = self.open_until.get(host, 0.0)
        if expiry > now:
            return True
        if host in self.open_until and expiry <= now:
            # Half-open / reset trial
            del self.open_until[host]
            self.consecutive_failures[host] = 0
        return False

    def record_success(self, host: str) -> None:
        self.consecutive_failures[host] = 0
        self.open_until.pop(host, None)

    def record_failure(self, host: str) -> bool:
        """Returns True if this failure tripped the circuit open."""
        count = self.consecutive_failures.get(host, 0) + 1
        self.consecutive_failures[host] = count
        if count >= self.failure_threshold:
            self.open_until[host] = time.time() + self.recovery_seconds
            log.warning("⚡ Circuit breaker TRIPPED for %s (open for %ss)", host, self.recovery_seconds)
            return True
        return False


class CrawlerRateLimiter:
    def __init__(self, default_rps: float = 2.0):
        self.default_rps = default_rps
        self._buckets: dict[str, DomainTokenBucket] = {}
        self.circuit_breaker = CircuitBreaker()
        self.semaphore = asyncio.Semaphore(10)  # Bounded global concurrency of 10

    def get_host(self, url: str) -> str:
        try:
            return urlparse(url).netloc.lower() or "default"
        except Exception:
            return "default"

    async def throttle(self, url: str, rps: Optional[float] = None) -> None:
        host = self.get_host(url)
        if self.circuit_breaker.is_open(host):
            raise RuntimeError(f"Circuit breaker is open for {host}; requests temporarily suspended")

        if host not in self._buckets:
            self._buckets[host] = DomainTokenBucket(rps=rps or self.default_rps)

        await self._buckets[host].acquire()
