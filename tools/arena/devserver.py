import functools
import http.server
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    directory = sys.argv[2] if len(sys.argv) > 2 else "docs"
    handler = functools.partial(NoStoreHandler, directory=directory)
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
