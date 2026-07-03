# Records real FastAPI responses into tests/contract-fixtures/ so the TypeScript
# port can be validated against the actual wire format (field names, casing,
# status codes). Uses an isolated database and a fake authenticated user; talks
# to the real local MinIO. Endpoints that would call paid AI services (avatar
# generation, WOA generation, classification) are not recorded — their contracts
# are covered by the ported test suite instead.
#
# Run from api/ (after `docker compose up -d` and creating the database):
#   psql postgresql://dressme:dressme@localhost:5432/local \
#     -c "DROP DATABASE IF EXISTS contract_fixtures;" -c "CREATE DATABASE contract_fixtures;"
#   uv run python scripts/record_contract.py
import json
import os
from pathlib import Path

SEED_USER_ID = "auth0|contract-fixture-user"

# Must be set before importing dressme: settings and the DB engine are created at
# import time. Environment variables take priority over .env values.
os.environ["DATABASE_URL"] = "postgresql://dressme:dressme@localhost:5432/contract_fixtures"
os.environ["AUTH0_SEED_USER_ID"] = SEED_USER_ID
os.environ["MODE"] = "development"
os.environ["S3_ENDPOINT_URL"] = "http://localhost:9100"

from fastapi.testclient import TestClient  # noqa: E402

from dressme.auth import verify_token  # noqa: E402
from dressme.db.seed import seed  # noqa: E402
from dressme.main import app  # noqa: E402

ROOT_PATH = Path(__file__).parent.parent.parent
FIXTURES_PATH = ROOT_PATH / "tests" / "contract-fixtures"
GOLDEN_PATH = ROOT_PATH / "tests" / "golden"


def write_json(name: str, data: object):
    path = FIXTURES_PATH / name
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"wrote {path.relative_to(ROOT_PATH)}")


def record():
    FIXTURES_PATH.mkdir(parents=True, exist_ok=True)
    GOLDEN_PATH.mkdir(parents=True, exist_ok=True)

    seed()

    app.dependency_overrides[verify_token] = lambda: {"sub": SEED_USER_ID}
    with TestClient(app) as client:
        write_json("healthz.json", client.get("/healthz").json())
        write_json("users_me.json", client.get("/users/me").json())

        wearables = client.get("/wearables").json()
        write_json("wearables.json", wearables)

        top_id = next(w["id"] for w in wearables if w["category"] == "t-shirt")
        bottom_id = next(w["id"] for w in wearables if w["category"] == "pants")
        outfit_params = {"top_id": top_id, "bottom_id": bottom_id}

        created = client.post("/outfits", params=outfit_params)
        duplicate = client.post("/outfits", params=outfit_params)
        outfits = client.get("/outfits").json()
        write_json("outfits.json", outfits)

        outfit_image = client.get("/images/outfit", params=outfit_params)
        (GOLDEN_PATH / "outfit_endpoint_tshirt_pants.jpg").write_bytes(outfit_image.content)
        print("wrote tests/golden/outfit_endpoint_tshirt_pants.jpg")

        deleted = client.delete("/outfits", params={"id": outfits[0]["id"]})
        delete_missing = client.delete("/outfits", params={"id": outfits[0]["id"]})
        # The endpoint does not validate body parts: the same wearable for top
        # and bottom is accepted and composited twice. Record that as-is.
        same_wearable = client.get(
            "/images/outfit", params={"top_id": top_id, "bottom_id": top_id}
        )
        missing_wearable = client.get(
            "/images/outfit",
            params={"top_id": top_id, "bottom_id": "00000000-0000-0000-0000-000000000000"},
        )

        write_json(
            "status_codes.json",
            {
                "POST /outfits (new)": {"status": created.status_code, "body": created.text},
                "POST /outfits (duplicate)": {"status": duplicate.status_code, "body": duplicate.text},
                "GET /images/outfit": {
                    "status": outfit_image.status_code,
                    "content_type": outfit_image.headers.get("content-type"),
                    "cache_control": outfit_image.headers.get("cache-control"),
                },
                "GET /images/outfit (same wearable as top and bottom)": {
                    "status": same_wearable.status_code,
                    "content_type": same_wearable.headers.get("content-type"),
                },
                "GET /images/outfit (unknown bottom id)": {
                    "status": missing_wearable.status_code,
                    "body": missing_wearable.json(),
                },
                "DELETE /outfits": {"status": deleted.status_code, "body": deleted.text},
                "DELETE /outfits (missing)": {
                    "status": delete_missing.status_code,
                    "body": delete_missing.json(),
                },
            },
        )

        write_json("openapi.json", client.get("/openapi.json").json())

    app.dependency_overrides.clear()


if __name__ == "__main__":
    record()
