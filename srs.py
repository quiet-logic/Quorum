"""
SM-2 spaced repetition algorithm.

Reference: Piotr Wozniak's original SM-2 specification.
https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
"""

from datetime import date, timedelta


def sm2(easiness: float, interval: int, repetitions: int, score: int) -> tuple[float, int, int]:
    """
    Calculate updated SM-2 values after a review.

    Args:
        easiness:    Current easiness factor (EF). Starts at 2.5, floor of 1.3.
        interval:    Current interval in days.
        repetitions: Number of successful reviews so far.
        score:       Quality of recall, 0–5.

    Returns:
        (new_easiness, new_interval, new_repetitions)

    Score semantics (from spec):
        0 — Blank    } reset: interval → 1, repetitions → 0
        1 — Hard     }
        2 — Wrong    }
        3 — Tricky   } space further
        4 — Good     }
        5 — Perfect  }
    """
    if score < 3:
        # Failed recall — reset schedule, EF unchanged
        return easiness, 1, 0

    # Update easiness factor
    new_ef = easiness + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)
    new_ef = max(1.3, new_ef)

    # Update interval (use old EF for this card's interval calculation)
    if repetitions == 0:
        new_interval = 1
    elif repetitions == 1:
        new_interval = 6
    else:
        new_interval = round(interval * easiness)

    return new_ef, new_interval, repetitions + 1


def next_review_date(interval: int, from_date: date | None = None) -> date:
    """Return the date the card should next be reviewed."""
    base = from_date or date.today()
    return base + timedelta(days=interval)
