"""Regression contract for supervised auto-apply payloads."""

from server import ApplyRequest


def test_apply_request_ignores_legacy_match_threshold_fields() -> None:
    request = ApplyRequest(
        url="https://careers.example.test/jobs/123",
        min_match=100,
        match_score=1,
    )
    payload = request.model_dump() if hasattr(request, "model_dump") else request.dict()

    assert "min_match" not in payload
    assert "match_score" not in payload


if __name__ == "__main__":
    test_apply_request_ignores_legacy_match_threshold_fields()
    print("apply contract tests passed")
