import pytest

from backend import config


@pytest.mark.parametrize("secret", ["", "short", "forest-guard-ai-demo-secret-change-me", "change-me-to-a-long-random-string"])
def test_production_rejects_unsafe_signing_configuration(monkeypatch, secret):
    monkeypatch.setattr(config, "APP_ENV", "production")
    monkeypatch.setattr(config, "_configured_secret", secret)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        config.validate_authority_secret()


def test_development_allows_local_signing_configuration(monkeypatch):
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "_configured_secret", "")
    config.validate_authority_secret()
