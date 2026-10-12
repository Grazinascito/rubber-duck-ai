"""T028 — unit tests for the pure sleep decision."""

from main import should_sleep


def test_returns_true_when_now_minus_last_utterance_equals_the_timeout():
    assert should_sleep(last_utterance=100.0, now=180.0, timeout_seconds=80.0) is True


def test_returns_false_when_now_minus_last_utterance_is_below_the_timeout():
    assert should_sleep(last_utterance=100.0, now=179.9, timeout_seconds=80.0) is False


def test_returns_true_when_the_silence_exceeds_the_timeout_by_several_seconds():
    assert should_sleep(last_utterance=100.0, now=250.0, timeout_seconds=80.0) is True
