"""Liveness smoke for a running local Compose stack, not an MVP acceptance test."""

import json
import subprocess
import urllib.request


def main() -> None:
    with urllib.request.urlopen("http://127.0.0.1:8080/healthz", timeout=5) as response:
        assert json.load(response) == {"status": "ok", "service": "backend"}
    with urllib.request.urlopen("http://127.0.0.1:5173", timeout=5) as response:
        assert response.status == 200
    for service, port in (("ai-service", 8000), ("mock-services", 8001)):
        subprocess.run(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                service,
                "python",
                "-c",
                "import json,urllib.request; "
                "r=json.load(urllib.request.urlopen("
                f"'http://127.0.0.1:{port}/healthz',timeout=5)); "
                f"assert r == {{'status':'ok','service':'{service}'}}",
            ],
            check=True,
        )
    print("Liveness smoke passed. S1–S4 acceptance tests are still required.")


if __name__ == "__main__":
    main()
