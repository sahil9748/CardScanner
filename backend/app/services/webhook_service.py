import logging
import threading
from typing import Dict, Any
import httpx

logger = logging.getLogger(__name__)


def _send_webhook_worker(url: str, payload: Dict[str, Any]):
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                json=payload,
                headers={
                    "User-Agent": "CardScan-Webhook/1.0",
                    "Content-Type": "application/json",
                },
            )
            logger.info("Webhook dispatched to %s, status: %s", url, resp.status_code)
    except Exception as e:
        logger.warning("Failed to dispatch webhook to %s: %s", url, e)


class WebhookService:
    @staticmethod
    def trigger_card_scanned(
        webhook_url: str,
        pin: str,
        pin_label: str,
        card_id: str,
        reference_code: str,
        card_type: str,
        images_dict: Dict[str, Any],
        base_url: str,
        timestamp: str,
    ):
        """
        Fire and forget webhook notification in a background daemon thread.
        Never blocks the customer request cycle.
        """
        if not webhook_url:
            return

        payload = {
            "event": "card.scanned",
            "pin": pin,
            "pin_label": pin_label,
            "card_id": card_id,
            "reference_code": reference_code,
            "card_type": card_type,
            "images": images_dict,
            "timestamp": timestamp,
        }

        thread = threading.Thread(
            target=_send_webhook_worker,
            args=(webhook_url, payload),
            daemon=True,
        )
        thread.start()
