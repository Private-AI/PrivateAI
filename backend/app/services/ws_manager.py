"""WebSocket connection manager for real-time deployment progress.

Clients subscribe to a deployment ID and receive JSON messages as
the provisioning and setup steps progress.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages per-deployment WebSocket subscriptions."""

    def __init__(self) -> None:
        # deployment_id -> set of active WebSocket connections
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, deployment_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[deployment_id].add(websocket)
        logger.info(
            "WebSocket connected for deployment %s (%d listeners)",
            deployment_id,
            len(self._connections[deployment_id]),
        )

    def disconnect(self, deployment_id: str, websocket: WebSocket) -> None:
        self._connections[deployment_id].discard(websocket)
        if not self._connections[deployment_id]:
            del self._connections[deployment_id]

    async def broadcast(self, deployment_id: str, message: dict[str, Any]) -> None:
        """Send a JSON message to all listeners for a deployment."""
        dead: list[WebSocket] = []
        for ws in self._connections.get(deployment_id, set()):
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[deployment_id].discard(ws)


# Singleton instance used by the orchestrator and router
ws_manager = WebSocketManager()
