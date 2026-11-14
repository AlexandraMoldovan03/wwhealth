"""LungVision exceptions — no heavy imports, so routes can catch them without torch installed."""


class InvalidImageError(ValueError):
    """The upload is not a usable JPEG/PNG image (message is safe to show to the user)."""


class ModelUnavailableError(RuntimeError):
    """Weights or ML dependencies are missing on the server."""
