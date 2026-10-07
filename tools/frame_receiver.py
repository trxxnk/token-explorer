# Tiny receiver for tools/snap.js: the page POSTs lossless PNG frames to http://localhost:8099/<name>,
# they are written next to this file as <name>.png. Copy it to a scratch folder before running.
import os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
D = os.path.dirname(os.path.abspath(__file__))
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        name = os.path.basename(self.path) or 'frame'
        open(os.path.join(D, name + '.png'), 'wb').write(body)
        self.send_response(204); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers()
HTTPServer(('127.0.0.1', 8099), H).serve_forever()
