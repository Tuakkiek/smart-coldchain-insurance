"""End-to-end HTTP behavior of the Python telemetry sender."""

import contextlib
import io
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import send_telemetry  # noqa: E402


SHIPMENT_ID = "8b4fb8a2-2996-4da2-90b9-35019517f56f"


class Receiver(BaseHTTPRequestHandler):
    requests = []
    responses = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.requests.append((self.path, self.headers["Content-Type"], json.loads(body)))
        status = self.responses.pop(0) if self.responses else 201
        self.send_response(status)
        self.end_headers()
        self.wfile.write(b'{"id":"sample"}' if status == 201 else b"temporary error")

    def log_message(self, *_args):
        pass


class SimulatorHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        Receiver.requests = []
        Receiver.responses = []
        self.args = [
            "--shipment-id", SHIPMENT_ID,
            "--base-url", self.url,
            "--interval-seconds", "0",
            "--retry-delay-seconds", "0",
            "--timeout-seconds", "1",
        ]

    def run_sender(self, *extra):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return send_telemetry.run(self.args + list(extra))

    def test_sequence_delivers_multiple_samples_without_gps(self):
        self.assertEqual(self.run_sender("--normal-count", "2", "--breach-count", "2"), 0)
        self.assertEqual(len(Receiver.requests), 4)
        self.assertEqual(
            [item[2]["temperature_c"] for item in Receiver.requests],
            [5.0, 5.0, 9.2, 9.2],
        )
        for path, content_type, payload in Receiver.requests:
            self.assertEqual(path, f"/api/v1/shipments/{SHIPMENT_ID}/telemetry")
            self.assertEqual(content_type, "application/json")
            self.assertEqual(set(payload), {"device_id", "temperature_c", "humidity_pct"})

    def test_temporary_server_error_retries_with_limit(self):
        Receiver.responses = [503, 201]
        self.assertEqual(self.run_sender("--mode", "normal", "--count", "1", "--retries", "1"), 0)
        self.assertEqual(len(Receiver.requests), 2)

    def test_client_error_does_not_retry(self):
        Receiver.responses = [422]
        self.assertEqual(self.run_sender("--mode", "normal", "--count", "1", "--retries", "3"), 1)
        self.assertEqual(len(Receiver.requests), 1)

    def test_retries_stop_after_configured_limit(self):
        Receiver.responses = [503, 503, 503]
        self.assertEqual(self.run_sender("--mode", "normal", "--count", "1", "--retries", "2"), 1)
        self.assertEqual(len(Receiver.requests), 3)

    def test_dry_run_sends_no_requests(self):
        self.assertEqual(self.run_sender("--dry-run"), 0)
        self.assertEqual(Receiver.requests, [])

    def test_invalid_sensor_values_are_rejected_before_network(self):
        for invalid in (("--normal-temp", "NaN"), ("--humidity", "101")):
            with self.subTest(invalid=invalid):
                with contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit):
                        send_telemetry.run(self.args + list(invalid))
        self.assertEqual(Receiver.requests, [])


if __name__ == "__main__":
    unittest.main()
