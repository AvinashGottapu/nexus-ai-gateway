import time
from enum import Enum
from typing import Dict, Any
from dataclasses import dataclass

# =====================================================================
# LAYER D: RELIABILITY + SCALE - STATEFUL CIRCUIT BREAKER
# =====================================================================

class CircuitState(str, Enum):
    CLOSED = "CLOSED"        # 🟢 Healthy: Normal operations
    OPEN = "OPEN"            # 🔴 Tripped: Outage detected, bypass provider in 0ms
    HALF_OPEN = "HALF_OPEN"  # 🟡 Probing: Cooldown passed, sending 1 trial request


@dataclass
class ProviderCircuit:
    state: CircuitState = CircuitState.CLOSED
    consecutive_failures: int = 0
    tripped_at: float = 0.0
    failure_threshold: int = 3          # Trips to OPEN after 3 consecutive crashes
    cooldown_seconds: float = 60.0      # Stays OPEN for 60s before testing recovery
    trial_in_flight: bool = False       # Ensures only 1 probe request tests HALF_OPEN


class CircuitBreakerManager:
    """
    Stateful circuit breaker protecting the gateway against upstream LLM outages.
    - Prevents 10-second request freezes when a provider goes down.
    - Automatically trips to OPEN after 3 consecutive failures.
    - Automatically tests recovery (HALF_OPEN) after 60s cooldown.
    """
    def __init__(self):
        self.circuits: Dict[str, ProviderCircuit] = {
            "groq": ProviderCircuit(),
            "openai": ProviderCircuit(),
            "gemini": ProviderCircuit()
        }

    def _get_circuit(self, provider: str) -> ProviderCircuit:
        provider_key = provider.lower()
        if provider_key not in self.circuits:
            self.circuits[provider_key] = ProviderCircuit()
        return self.circuits[provider_key]

    def can_execute(self, provider: str) -> bool:
        """
        Determines if a request is allowed to call the provider in 0.0ms:
        - CLOSED: Allowed
        - OPEN: Blocked unless 60s cooldown passed (then shifts to HALF_OPEN)
        - HALF_OPEN: Only 1 trial request allowed through at a time
        """
        circuit = self._get_circuit(provider)
        now = time.time()

        # 1. Healthy State (CLOSED)
        if circuit.state == CircuitState.CLOSED:
            return True

        # 2. Tripped State (OPEN)
        if circuit.state == CircuitState.OPEN:
            # Check if 60-second cooldown period has elapsed
            if now - circuit.tripped_at >= circuit.cooldown_seconds:
                # Transition to HALF_OPEN to test if provider recovered
                circuit.state = CircuitState.HALF_OPEN
                circuit.trial_in_flight = True
                print(f"🟡 Circuit Breaker for '{provider}' entered HALF_OPEN. Dispatching 1 trial probe...")
                return True
            else:
                # Still in cooldown: Bypassed instantly in 0.0ms!
                return False

        # 3. Probing State (HALF_OPEN)
        if circuit.state == CircuitState.HALF_OPEN:
            # Allow only the first trial probe through, divert others to fallback
            if not circuit.trial_in_flight:
                circuit.trial_in_flight = True
                return True
            return False

        return True

    def record_success(self, provider: str) -> None:
        """Called when an LLM call succeeds. Resets breaker to CLOSED."""
        circuit = self._get_circuit(provider)
        if circuit.state != CircuitState.CLOSED:
            print(f"🟢 Circuit Breaker for '{provider}' recovered! Resetting to CLOSED (Healthy).")

        circuit.state = CircuitState.CLOSED
        circuit.consecutive_failures = 0
        circuit.tripped_at = 0.0
        circuit.trial_in_flight = False

    def record_failure(self, provider: str) -> None:
        """Called when an LLM call times out or throws an error."""
        circuit = self._get_circuit(provider)
        circuit.consecutive_failures += 1
        now = time.time()

        # If failure occurs during HALF_OPEN trial or reaches threshold
        if circuit.state == CircuitState.HALF_OPEN or circuit.consecutive_failures >= circuit.failure_threshold:
            circuit.state = CircuitState.OPEN
            circuit.tripped_at = now
            circuit.trial_in_flight = False
            print(
                f"🔴 Circuit Breaker TRIPPED to OPEN for '{provider}'! "
                f"Consecutive failures: {circuit.consecutive_failures}. "
                f"Bypassing all traffic to fallbacks for {circuit.cooldown_seconds}s."
            )

    def get_status(self) -> Dict[str, Any]:
        """Returns live circuit breaker health for observability dashboards."""
        now = time.time()
        status_report = {}

        for provider, circuit in self.circuits.items():
            remaining_cooldown = 0.0
            if circuit.state == CircuitState.OPEN:
                remaining_cooldown = max(0.0, round(circuit.cooldown_seconds - (now - circuit.tripped_at), 1))

            status_report[provider] = {
                "state": circuit.state.value,
                "consecutive_failures": circuit.consecutive_failures,
                "remaining_cooldown_seconds": remaining_cooldown
            }

        return status_report


# Global Circuit Breaker Singleton for the Gateway
circuit_breaker = CircuitBreakerManager()
