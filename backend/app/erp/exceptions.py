from typing import Any


class PhoenixAPIError(Exception):
    def __init__(self, status_code: int, detail: Any) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Phoenix ERP error {status_code}: {detail}")


class PhoenixUnauthorizedError(PhoenixAPIError):
    pass


class PhoenixNotFoundError(PhoenixAPIError):
    pass


class PhoenixValidationError(PhoenixAPIError):
    def __init__(self, errors: list[dict]) -> None:
        self.errors = errors
        super().__init__(422, errors)
