from fastapi.testclient import TestClient
from urllib.parse import quote
import pytest

from src.app import app

client = TestClient(app)


def test_get_activities():
    resp = client.get("/activities")
    assert resp.status_code == 200
    data = resp.json()
    # basic smoke checks
    assert isinstance(data, dict)
    assert "Chess Club" in data


def test_signup_and_unregister_flow():
    activity = "Chess Club"
    encoded = quote(activity, safe='')
    email = "pytest.user+1@example.com"

    # ensure not present initially
    resp = client.get("/activities")
    assert resp.status_code == 200
    data = resp.json()
    participants = data[activity]["participants"]
    if email in participants:
        # clean up from previous runs
        client.delete(f"/activities/{encoded}/participants?email={quote(email, safe='')}")

    # signup
    resp = client.post(f"/activities/{encoded}/signup?email={quote(email, safe='')}")
    assert resp.status_code == 200
    j = resp.json()
    assert "Signed up" in j.get("message", "")

    # verify present
    resp = client.get("/activities")
    data = resp.json()
    assert email in data[activity]["participants"]

    # unregister
    resp = client.delete(f"/activities/{encoded}/participants?email={quote(email, safe='')}")
    assert resp.status_code == 200
    j = resp.json()
    assert "Unregistered" in j.get("message", "")

    # verify removed
    resp = client.get("/activities")
    data = resp.json()
    assert email not in data[activity]["participants"]
