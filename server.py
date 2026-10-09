#!/usr/bin/env python3
"""Token Explorer server: own generation loop with full per-token information.

Unlike LM Studio / llama-server it reports, for every generated token:
  - probability and rank in the model's full vocabulary distribution, true entropy;
  - the top candidates before samplers and what each sampler stage did to them;
  - token ids, so the UI can branch from any position exactly (no re-tokenization).
It also lets the caller force tokens (to score arbitrary text) and continue from any prefix.

Run:  .venv/bin/python server.py            (then open http://localhost:8090)
The engine-specific part is the Backend class; the HTTP protocol does not depend on it.
"""
import argparse
import copy
import gc
import json
import os
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL_DIRS = [os.path.join(ROOT, "models"), os.path.expanduser("~/.lmstudio/models")]
PENALTY_LAST_N = 64
CHUNK = 256          # prompt tokens per forward pass
MAX_CHECKPOINTS = 8


def find_models():
    """Folders with MLX weights: config.json + *.safetensors, searched two levels deep."""
    found = {}
    for base in MODEL_DIRS:
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            depth = dirpath[len(base):].count(os.sep)
            if depth >= 2:
                dirnames[:] = []
            if "config.json" in filenames and any(f.endswith(".safetensors") for f in filenames):
                found.setdefault(os.path.basename(dirpath), dirpath)
                dirnames[:] = []
    return found


class MLXBackend:
    """Apple Silicon backend on top of mlx-lm. Holds one model and its prompt cache.

    The cache is not trimmable for hybrid architectures (Qwen3.5 keeps recurrent state in most layers),
    so instead of rewinding we keep snapshots ("checkpoints") and replay tokens from the nearest one.
    """
    name = "mlx"

    def __init__(self):
        self.model = self.tok = self.model_id = None
        self._reset()

    def _reset(self):
        self.cache, self.cache_ids, self.ckpts, self._labels = None, [], [], {}

    def load(self, model_id, path):
        import mlx.core as mx
        from mlx.utils import tree_flatten
        from mlx_lm import load
        self.model = self.tok = None
        self._reset()
        gc.collect()
        mx.clear_cache()
        self.model, self.tok = load(path)
        # bfloat16 keeps ~3 significant digits: the same tokens fed in different chunks then give probabilities
        # that differ by a couple of percent, and a branch would not reproduce the original numbers
        if any(v.dtype == mx.bfloat16 for _, v in tree_flatten(self.model.parameters())):
            self.model.set_dtype(mx.float32)
        self.model_id = model_id
        self.eos = set(self.tok.eos_token_ids)

    @property
    def info(self):
        return {"backend": self.name, "model": self.model_id, "layers": len(self.model.layers)} if self.model else {"backend": self.name, "model": None}

    # --- text <-> ids
    def render(self, messages, thinking, generation_prompt=True):
        return list(self.tok.apply_chat_template(messages, add_generation_prompt=generation_prompt, enable_thinking=thinking))

    def encode(self, text):
        return list(self.tok.encode(text, add_special_tokens=False))

    def decode(self, ids):
        return self.tok.decode(ids)

    def label(self, tid):
        """Text of a single token in isolation (may contain U+FFFD if it is part of a character)."""
        s = self._labels.get(tid)
        if s is None:
            s = self._labels[tid] = self.tok.decode([tid])
        return s

    # --- forward passes
    def _feed(self, ids):
        import mlx.core as mx
        out = None
        for i in range(0, len(ids), CHUNK):
            out = self.model(mx.array([ids[i:i + CHUNK]]), cache=self.cache)
            mx.eval(out)
        self.cache_ids += ids
        return out

    def prime(self, ids, marks):
        """Bring the cache to `ids` and return next-token logits plus how many tokens were reused.
        Checkpoints are saved at positions `marks` so that later requests can start from them."""
        import mlx.core as mx
        from mlx_lm.models.cache import make_prompt_cache
        fits = lambda key: len(key) < len(ids) and ids[:len(key)] == key
        best, live = None, self.cache is not None and fits(self.cache_ids)
        for ck in self.ckpts:
            if fits(ck[0]) and (best is None or len(ck[0]) > len(best[0])):
                best = ck
        if live and (best is None or len(self.cache_ids) >= len(best[0])):
            pass
        elif best is not None:
            self.ckpts.remove(best)
            self.ckpts.append(best)                      # most recently used last
            self.cache, self.cache_ids = copy.deepcopy(best[1]), list(best[0])
        else:
            self.cache, self.cache_ids = make_prompt_cache(self.model), []
        reused = len(self.cache_ids)
        for mark in marks:
            if len(self.cache_ids) < mark < len(ids):
                self._feed(ids[len(self.cache_ids):mark])
                self.ckpts = [c for c in self.ckpts if c[0] != ids[:mark]][-(MAX_CHECKPOINTS - 1):]
                self.ckpts.append((ids[:mark], copy.deepcopy(self.cache)))
        out = self._feed(ids[len(self.cache_ids):])
        return np.array(out[0, -1].astype(mx.float32)), reused

    def step(self, tid):
        import mlx.core as mx
        out = self.model(mx.array([[tid]]), cache=self.cache)
        self.cache_ids.append(tid)
        return np.array(out[0, -1].astype(mx.float32))


BACKENDS = {"mlx": MLXBackend}


def r4(x):
    """4 significant digits: enough for display, keeps events and saved chats small."""
    return float(f"{x:.4g}")


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def top_sorted(x, m):
    """Indices of the m largest values, best first."""
    n = x.shape[0]
    idx = np.argpartition(x, n - m)[n - m:] if m < n else np.arange(n)
    return idx[np.argsort(-x[idx])]


SHORTLIST = 2048     # without top-k the vocabulary is sorted only this deep unless a sampler needs more


def analyze(logits, o, recent, rng, forced=None, n_top=10):
    """One sampling step, llama.cpp order: repeat penalty -> top-k -> top-p -> min-p -> temperature.
    Returns the chosen token and a description of the whole decision."""
    l = logits.astype(np.float32, copy=False)
    V = l.shape[0]
    raw = softmax(l)                                     # what the model itself thinks, T = 1
    nz = raw[raw > 0]
    entropy = float(-(nz * np.log2(nz)).sum())

    lp, pen = l, float(o.get("repeat_penalty") or 1)
    if pen != 1 and recent:
        lp = l.copy()
        idx = np.fromiter(set(recent), dtype=np.int64)
        lp[idx] = np.where(lp[idx] > 0, lp[idx] / pen, lp[idx] * pen)

    k = int(o.get("top_k") or 0)
    k = k if 0 < k < V else V
    top_p = float(o["top_p"]) if o.get("top_p") is not None else 1.0
    min_p = float(o.get("min_p") or 0)
    temp = float(o["temperature"]) if o.get("temperature") is not None else 1.0

    def stages(m):
        """Filters over the m best candidates. None if the shortlist turned out to be too short."""
        cand = top_sorted(lp, m)
        base = softmax(lp[cand]) if m == k else softmax(lp)[cand]   # top-k renormalises, otherwise mass over the vocabulary
        n_p = keep = m
        if top_p < 1:
            cum = np.cumsum(base)
            if m < k and cum[-1] < top_p:
                return None
            n_p = keep = min(m, int(np.searchsorted(cum, top_p)) + 1)
        elif m < k:
            n_p = k
        if min_p > 0:
            kept = int((base[:keep] >= min_p * base[0]).sum())
            if m < k and top_p >= 1 and kept == m:
                return None
            keep = kept
        elif m < k and top_p >= 1:
            return None
        return cand, n_p, keep, base

    res = stages(min(k, SHORTLIST))
    if res is None and (top_p < 1 or min_p > 0):
        res = stages(k)
    if res is None:
        # no sampler removes anything: every token stays alive, no sorting needed
        if temp <= 0:
            best = int(lp.argmax())
            tid = best if forced is None else int(forced)
            fate = lambda i: {"q": 1.0 if i == best else 0.0}
        else:
            final = softmax(lp / temp)
            tid = int(rng.choice(V, p=final.astype(np.float64) / final.astype(np.float64).sum())) if forced is None else int(forced)
            fate = lambda i: {"q": r4(final[i])}
        counts, masses = [V, V, V], [1.0, 1.0]
        fullp = softmax(lp)
        stage_p = lambda i: float(fullp[i])
    else:
        cand, n_p, keep, base = res
        # probability right after top-k (the distribution the next filters work on) and the share of it
        # that survives top-p and min-p: enough for the UI to show every stage renormalised
        fullp = softmax(lp) if len(cand) < k else None
        masses = [float(base[:min(n_p, len(cand))].sum()) if top_p < 1 else 1.0, float(base[:keep].sum())]

        def stage_p(i):
            r = pos[i]
            if r < len(cand):
                return float(base[r])
            return float(fullp[i]) if fullp is not None else None
        if temp <= 0:
            final = np.zeros(keep); final[0] = 1.0
        else:
            final = softmax(lp[cand[:keep]].astype(np.float64) / temp)
        tid = int(cand[rng.choice(keep, p=final)]) if forced is None else int(forced)
        # every stage keeps a prefix of the sorted candidates, so a token's fate follows from its position
        pos = np.full(V, len(cand), dtype=np.int64)
        pos[cand] = np.arange(len(cand))

        def fate(i):
            r = pos[i]
            if r < keep:
                return {"q": r4(final[r])}
            if r >= k:
                return {"cut": "top_k"}
            return {"cut": "top_p" if r >= n_p else "min_p"}
        counts = [k, n_p, keep]

    pen_p = softmax(lp) if lp is not l else None         # distribution right after the repeat penalty

    def kprob(i):
        v = stage_p(i)
        d = {} if v is None else {"k": r4(v)}
        if pen_p is not None:
            d["pp"] = r4(pen_p[i])
        return d

    n_top = max(1, min(int(n_top), V - 1))
    top = top_sorted(l, n_top).tolist()
    if tid not in top:
        top.append(tid)
    return {
        "id": tid, "p": r4(raw[tid]), "rank": int((l > l[tid]).sum()) + 1, "H": r4(entropy), "n": counts,
        "m": [r4(x) for x in masses],
        "top": [dict({"id": i, "p": r4(raw[i])}, **fate(i), **kprob(i)) for i in top],
        **fate(tid),
    }


class Engine:
    """All model work runs in one worker thread: MLX arrays (the prompt cache) are bound to the thread
    that created them, while the HTTP server answers every request in a new thread."""

    def __init__(self, backend):
        self.backend = backend
        self.jobs = queue.Queue()
        threading.Thread(target=self._work, daemon=True).start()

    def _work(self):
        while True:
            fn, out = self.jobs.get()
            try:
                for ev in fn():
                    out.put(ev)
            except Exception as e:
                out.put(e)
            out.put(None)

    def run(self, fn):
        """Run generator function `fn` in the worker thread, yield its items here."""
        out = queue.Queue()
        self.jobs.put((fn, out))
        while True:
            ev = out.get()
            if ev is None:
                return
            if isinstance(ev, Exception):
                raise ev
            yield ev

    def stream(self, o, cancel):
        return self.run(lambda: self.generate(o, cancel))

    def ensure_model(self, model_id):
        models = find_models()
        if not model_id:
            model_id = self.backend.model_id or next(iter(models), None)
        if model_id == self.backend.model_id:
            return 0.0
        if model_id not in models:
            raise ValueError(f"Модель «{model_id}» не найдена. Доступны: {', '.join(models) or 'нет ни одной'}")
        t = time.time()
        self.backend.load(model_id, models[model_id])
        return time.time() - t

    def score(self, o):
        """One forward pass, no sampling: the next-token distribution after the prompt, with the probability
        and rank of every token the caller asked to watch (even deep in the tail). Yields a single result.

        This is the "read the logits of the answer labels" way of making a decision with an ordinary LLM."""
        b = self.backend
        self.ensure_model(o.get("model"))
        flat = lambda items: [i for x in (items or []) for i in ([int(x)] if isinstance(x, (int, float)) else b.encode(x))]
        if o.get("prompt") is not None:
            prompt_ids = b.encode(o["prompt"])
        else:
            prompt_ids = b.render(o.get("messages") or [], o.get("thinking", False))
        if not prompt_ids:
            raise ValueError("Пустой промпт")
        ids = prompt_ids + flat(o.get("prefix"))
        t0 = time.time()
        logits, reused = b.prime(ids, [len(prompt_ids) - 1])
        # Some tokenizers put a separate space token between "Answer:" and the label (Qwen splits off digits).
        # With skip_space the position is moved past such tokens, and the caller is told what was skipped.
        skipped = []
        while o.get("skip_space") and len(skipped) < 2:
            best = int(logits.argmax())
            if b.label(best).strip(" ") != "":
                break
            e = np.exp(logits - logits.max())
            skipped.append({"id": best, "t": b.label(best), "p": r4(float(e[best] / e.sum()))})
            ids = ids + [best]
            logits = b.step(best)
        l = logits.astype(np.float32, copy=False)
        raw = softmax(l)
        nz = raw[raw > 0]
        watch, seen = [], set()
        for text in o.get("watch") or []:
            toks = b.encode(text)
            # only a text that is exactly one token can be read from this distribution
            if len(toks) != 1 or toks[0] in seen:
                continue
            seen.add(toks[0])
            i = toks[0]
            watch.append({"text": text, "id": i, "t": b.label(i), "p": float(raw[i]), "logit": r4(l[i]), "rank": int((l > l[i]).sum()) + 1})
        n_top = max(1, min(int(o.get("n_probs", 10)), l.shape[0] - 1))
        yield {
            "model": b.model_id, "vocab": int(l.shape[0]), "prompt_tokens": len(ids), "cached_tokens": reused,
            "seconds": round(time.time() - t0, 3), "prompt": b.decode(ids), "skipped": skipped,
            "H": r4(float(-(nz * np.log2(nz)).sum())),
            "top": [{"id": i, "t": b.label(i), "p": r4(raw[i]), "logit": r4(l[i])} for i in top_sorted(l, n_top).tolist()],
            "watch": watch,
        }

    def generate(self, o, cancel=None):
        """Yields events: start, token..., done."""
        b = self.backend
        load_s = self.ensure_model(o.get("model"))
        flat = lambda items: [i for x in (items or []) for i in ([int(x)] if isinstance(x, (int, float)) else b.encode(x))]
        marks = []
        if o.get("prompt") is not None:
            prompt_ids = b.encode(o["prompt"])
        else:
            msgs, thinking = o.get("messages") or [], o.get("thinking", True)
            prompt_ids = b.render(msgs, thinking)
            # the next turn of this chat shares the prompt up to the end of the last message
            # (after it the template may differ: e.g. an empty <think> block only in the generation prompt)
            for i, (x, y) in enumerate(zip(prompt_ids, b.render(msgs, thinking, False))):
                if x != y:
                    break
            else:
                i = min(len(prompt_ids), len(b.render(msgs, thinking, False)))
            marks.append(i)
        if not prompt_ids:
            raise ValueError("Пустой промпт")
        ids = prompt_ids + flat(o.get("prefix"))
        forced = flat(o.get("force"))
        max_tokens, n_top = int(o.get("max_tokens", 256)), int(o.get("n_probs", 10))
        seed = o.get("seed")
        rng = np.random.default_rng(int(seed) if seed is not None and int(seed) >= 0 else None)

        t0 = time.time()
        # ...and every branch of this answer shares the whole prompt
        logits, reused = b.prime(ids, sorted(set(marks + [len(prompt_ids) - 1])))
        t1 = time.time()
        yield {
            "type": "start", "model": b.model_id, "prompt_tokens": len(ids), "cached_tokens": reused, "vocab": int(logits.shape[0]),
            "think_open": b.decode(prompt_ids[-8:]).rstrip().endswith("<think>"),
            "load_s": round(load_s, 2), "prompt_s": round(t1 - t0, 3),
        }
        ctx, pend, n, sampled, reason = ids[-4:], [], 0, 0, "length"
        while forced or sampled < max_tokens:
            was_forced = bool(forced)
            ev = analyze(logits, o, (ids[-PENALTY_LAST_N:] if n == 0 else recent), rng, forced.pop(0) if forced else None, n_top)
            tid = ev["id"]
            eos = tid in b.eos and not was_forced
            # a token may end in the middle of a UTF-8 character: hold its text until the character completes
            before = b.decode(ctx)
            text = b.decode(ctx + pend + [tid])
            held = ctx + pend
            if text.endswith("�") and len(pend) < 4 and not eos:
                pend.append(tid); piece = ""
            else:
                piece = text[len(before):]; ctx = (ctx + pend + [tid])[-4:]; pend = []
            for c in ev["top"]:
                c["t"] = b.label(c["id"])
                if "�" in c["t"]:                   # a fragment of a character: show what it completes, if anything
                    full = b.decode(held + [c["id"]])
                    if not full.endswith("�"):
                        c["t"] = full[len(before):]
            ev.update(type="token", t=b.label(tid) if eos else piece)
            if was_forced:
                ev["forced"] = True
            if eos:
                ev["eos"] = True
            yield ev
            n += 1
            sampled += 0 if was_forced else 1
            if eos:
                reason = "stop"
                break
            if not (forced or sampled < max_tokens):
                break
            if cancel is not None and cancel.is_set():
                reason = "abort"
                break
            recent = b.cache_ids[-PENALTY_LAST_N + 1:] + [tid]
            logits = b.step(tid)
        dt = time.time() - t1
        yield {"type": "done", "reason": reason, "tokens": n, "tps": round(n / dt, 2) if dt > 0 else 0}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    engine = None

    def log_message(self, fmt, *args):
        if "/generate" in (args[0] if args else ""):
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def _head(self, code, ctype, length=None):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Type", ctype)
        if length is None:
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.close_connection = True
        else:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self._head(code, "application/json; charset=utf-8", len(body))
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._head(204, "text/plain", 0)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            with open(os.path.join(ROOT, "index.html"), "rb") as f:
                body = f.read()
            self._head(200, "text/html; charset=utf-8", len(body))
            self.wfile.write(body)
        elif path == "/v1/models":
            self._json(200, {"object": "list", "data": [{"id": m, "object": "model"} for m in find_models()]})
        elif path == "/info":
            self._json(200, dict(self.engine.backend.info, engine="token-explorer", protocol=1))
        else:
            self._json(404, {"error": {"message": "not found"}})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/generate", "/score"):
            return self._json(404, {"error": {"message": "not found"}})
        try:
            o = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except Exception as e:
            return self._json(400, {"error": {"message": f"Некорректный JSON: {e}"}})
        if path == "/score":
            try:
                return self._json(200, next(self.engine.run(lambda: self.engine.score(o))))
            except Exception as e:
                return self._json(400 if isinstance(e, ValueError) else 500, {"error": {"message": f"{type(e).__name__}: {e}"}})
        started, cancel = False, threading.Event()
        try:
            for ev in self.engine.stream(o, cancel):
                if not started:
                    self._head(200, "text/event-stream; charset=utf-8")
                    started = True
                self.wfile.write(b"data: " + json.dumps(ev, ensure_ascii=False).encode() + b"\n\n")
                self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
        except (BrokenPipeError, ConnectionResetError):
            cancel.set()                                 # the client pressed stop
        except Exception as e:
            msg = {"error": {"message": f"{type(e).__name__}: {e}"}}
            if started:
                try:
                    self.wfile.write(b"data: " + json.dumps(msg, ensure_ascii=False).encode() + b"\n\n")
                except OSError:
                    pass
            else:
                self._json(400 if isinstance(e, ValueError) else 500, msg)


def main():
    ap = argparse.ArgumentParser(description="Token Explorer server")
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--backend", default="mlx", choices=sorted(BACKENDS))
    ap.add_argument("--model", help="имя папки с моделью; по умолчанию загружается при первом запросе")
    ap.add_argument("--models-dir", action="append", help="дополнительная папка с моделями")
    a = ap.parse_args()
    MODEL_DIRS[:0] = a.models_dir or []
    engine = Handler.engine = Engine(BACKENDS[a.backend]())
    models = find_models()
    print("Модели:", ", ".join(models) or "не найдены (положите MLX-модель в ./models)")
    if a.model:
        print(f"Загружаю {a.model}…")
        list(engine.run(lambda: iter([engine.ensure_model(a.model)])))
    print(f"Token Explorer: http://{a.host}:{a.port}")
    try:
        ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
