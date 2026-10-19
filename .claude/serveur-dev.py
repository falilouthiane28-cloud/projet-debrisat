# Serveur de developpement : desactive le cache pour que chaque modification soit visible au rechargement.
import http.server
import mimetypes
import sys

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")


class SansCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
http.server.ThreadingHTTPServer(("127.0.0.1", port), SansCache).serve_forever()
