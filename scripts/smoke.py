"""Liveness smoke for a running local Compose stack, not an MVP acceptance test."""

import json
import os
import subprocess
import urllib.request


def main() -> None:
    backend_port = int(os.environ.get("BACKEND_PORT", "8080"))
    frontend_port = int(os.environ.get("FRONTEND_PORT", "5173"))
    with urllib.request.urlopen(f"http://127.0.0.1:{backend_port}/healthz", timeout=5) as response:
        assert json.load(response) == {"status": "ok", "service": "backend"}
    with urllib.request.urlopen(f"http://127.0.0.1:{frontend_port}", timeout=5) as response:
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
    print("Liveness smoke passed. P0 journey/feedback acceptance is still required.")


if __name__ == "__main__":
    main()
