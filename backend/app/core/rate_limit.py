import time
from typing import Dict, Tuple
from fastapi import HTTPException, status
from app.core.config import settings


class RateLimiter:
    """
    Sliding window / progressive delay rate limiter for PIN validation and Admin login.
    Tracks failed attempts by client identifier (e.g. IP address).
    """

    def __init__(self):
        # Maps key -> (failed_count, lockout_until_timestamp, last_attempt_timestamp)
        self._records: Dict[str, Tuple[int, float, float]] = {}

    def _clean_expired(self, key: str, max_age: float = 3600.0):
        if key in self._records:
            _, lockout_until, last_attempt = self._records[key]
            now = time.time()
            if now > lockout_until and (now - last_attempt) > max_age:
                del self._records[key]

    def check_allowed(self, key: str, max_failed: int, lockout_seconds: int) -> None:
        """
        Check if the key is allowed to make an attempt.
        Raises HTTPException 429 if currently locked out.
        """
        self._clean_expired(key)
        if key not in self._records:
            return

        failed_count, lockout_until, _ = self._records[key]
        now = time.time()

        if now < lockout_until:
            wait_time = int(lockout_until - now) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Please wait {wait_time} seconds before trying again.",
            )

    def record_failure(self, key: str, max_failed: int, lockout_seconds: int) -> int:
        """
        Record a failure for the key. If failure count >= max_failed, apply lockout.
        Returns remaining allowed attempts before lockout.
        """
        now = time.time()
        failed_count = 1
        if key in self._records:
            failed_count, lockout_until, _ = self._records[key]
            if now > lockout_until:
                failed_count += 1
            else:
                failed_count += 1
        else:
            failed_count = 1

        lockout_until = 0.0
        if failed_count >= max_failed:
            # Progressive multiplier: e.g. for repeat lockouts, multiply lockout duration
            multiplier = min(failed_count - max_failed + 1, 5)
            lockout_until = now + (lockout_seconds * multiplier)

        self._records[key] = (failed_count, lockout_until, now)
        remaining = max(0, max_failed - failed_count)
        return remaining

    def record_success(self, key: str) -> None:
        """Clear failures on successful authentication."""
        if key in self._records:
            del self._records[key]

    def reset_all(self) -> None:
        """Reset all rate limiter records (useful for test suites)."""
        self._records.clear()


pin_rate_limiter = RateLimiter()
admin_rate_limiter = RateLimiter()
