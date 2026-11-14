"""Allowlist operational metadata rather than attempting to enumerate all secrets."""
def scrub_event(event, hint):
    event.pop("user", None)
    event.pop("breadcrumbs", None)
    event.pop("extra", None)
    request = event.get("request")
    if request:
        event["request"] = {"method": request.get("method"), "url": request.get("url", "").split("?", 1)[0]}
    for exception in event.get("exception", {}).get("values", []):
        exception["value"] = exception.get("type", "Application error")
        for frame in exception.get("stacktrace", {}).get("frames", []):
            frame.pop("vars", None)
    return event
