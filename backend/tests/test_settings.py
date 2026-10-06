def test_defaults(client, auth):
    r = client.get("/api/settings", headers=auth)
    assert r.json() == {
        "theme": "dark",
        "default_educational_level": 2,
        "voice_enabled": False,
        "preferred_language": "en",
    }


def test_update(client, auth):
    r = client.put(
        "/api/settings",
        headers=auth,
        json={"default_educational_level": 5, "preferred_language": "he", "voice_enabled": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["default_educational_level"] == 5
    assert body["preferred_language"] == "he"
    assert body["voice_enabled"] is True


def test_invalid_level(client, auth):
    r = client.put("/api/settings", headers=auth, json={"default_educational_level": 9})
    assert r.status_code == 422


def test_voice_clone_not_implemented(client, auth):
    assert client.post("/api/voice/clone", headers=auth).status_code == 501
