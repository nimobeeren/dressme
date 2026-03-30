"""Wearable category definitions and body-part mapping."""

from typing import Literal, get_args

WearableCategory = Literal[
    "t-shirt", "shirt", "sweater", "jacket", "top", "pants", "shorts", "skirt"
]

BodyPart = Literal["top", "bottom"]

CATEGORY_BODY_PARTS: dict[WearableCategory, BodyPart] = {
    "t-shirt": "top",
    "shirt": "top",
    "sweater": "top",
    "jacket": "top",
    "top": "top",
    "pants": "bottom",
    "shorts": "bottom",
    "skirt": "bottom",
}

_expected = set(get_args(WearableCategory))
assert set(CATEGORY_BODY_PARTS.keys()) == _expected, (
    f"CATEGORY_BODY_PARTS out of sync with WearableCategory: "
    f"missing={_expected - CATEGORY_BODY_PARTS.keys()}, "
    f"extra={CATEGORY_BODY_PARTS.keys() - _expected}"
)


def get_body_part(category: str) -> BodyPart:
    """Get the body part for a wearable category.
    Raises ValueError if the category is unknown."""
    body_part = CATEGORY_BODY_PARTS.get(category)  # type: ignore[arg-type]
    if body_part is None:
        raise ValueError(f"Unknown wearable category: {category}")
    return body_part
