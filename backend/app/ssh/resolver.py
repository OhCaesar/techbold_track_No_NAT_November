"""Resolve the SSH private-key file for a given ERP customer ID.

Convention:
    customer_id 5001 → case1_key.pem
    customer_id 5002 → case2_key.pem
    …
"""

from __future__ import annotations

import os


def resolve_ssh_key(customer_id: int, keys_dir: str = "/keys") -> str:
    """Return the absolute path to the ``.pem`` file for *customer_id*.

    Raises:
        FileNotFoundError: If the derived key file does not exist on disk.
        ValueError: If the customer_id does not map to a valid case number.
    """
    case_number = customer_id - 5000
    if case_number < 1:
        raise ValueError(
            f"customer_id {customer_id} does not map to a valid case number "
            f"(got case {case_number})"
        )

    path = os.path.join(keys_dir, f"case{case_number}_key.pem")
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"No SSH key found for customer {customer_id} at {path}"
        )

    return path
