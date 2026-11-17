"""Servidor de teste que registra cada requisição com os cabeçalhos de pré-carregamento."""
import http.server, os, sys
LOG = os.path.join(os.path.dirname(__file__), 'requests.log')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, fmt, *args):
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(f"{self.command} {self.path} sec-purpose={self.headers.get('Sec-Purpose','-')} purpose={self.headers.get('Purpose','-')}\n")
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
