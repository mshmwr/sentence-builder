import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  newGame,
  poolTiles,
  placedTiles,
  stars,
  placeTile,
  moveTile,
  removeTile,
  clearAll,
  check,
  hint,
} from "./engine.js";
import { shuffle } from "./puzzles.js";
import { generatePuzzle } from "./generate.js";
import {
  watchAuth,
  loginWithGoogle,
  logout,
  loadGeminiKey,
  saveGeminiKey,
  addHistory,
  loadHistory,
} from "./firebase.js";

const LS_KEY = "pinju-gemini-key"; // key storage for logged-out users

function readLocalKey() {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return ""; // storage blocked (private mode) — treat as no key
  }
}

function Head({ children }) {
  return (
    <header className="st-head">
      <div className="st-brand">
        <span className="st-mark">拼句</span>
        <span className="st-tag">把中文，拼成對的英文</span>
      </div>
      {children}
    </header>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaving, setKeySaving] = useState(false);

  const [mode, setMode] = useState("input"); // "input" | "loading" | "playing" | "key" | "history"
  const [inputZh, setInputZh] = useState("");
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [shake, setShake] = useState(false);
  const [nudge, setNudge] = useState("");
  const [genError, setGenError] = useState("");
  const [history, setHistory] = useState(null); // null = loading

  useEffect(() => {
    let latestUid = null; // discard key loads that resolve after an account switch
    return watchAuth(async (u) => {
      latestUid = u ? u.uid : null;
      setUser(u);
      setAuthReady(true);
      if (u) {
        setKeyLoaded(false);
        const uid = u.uid;
        let k = "";
        let loadFailed = false;
        try {
          k = await loadGeminiKey(uid);
        } catch {
          loadFailed = true; // read failure ≠ no key — must not trigger the promote-write below
        }
        if (!k && !loadFailed) {
          // logged in with a local-only key: promote it to the account
          const local = readLocalKey();
          if (local) {
            k = local;
            saveGeminiKey(uid, local)
              .then(() => localStorage.removeItem(LS_KEY)) // moved, not mirrored — see key-screen copy
              .catch(() => {});
          }
        }
        if (latestUid === uid) {
          setGeminiKey(k);
          setKeyLoaded(true);
        }
      } else {
        setGeminiKey(readLocalKey());
        setKeyLoaded(true);
        setMode((m) => (m === "history" ? "input" : m)); // history is account-only
      }
    });
  }, []);

  const order = useMemo(
    () => (game ? shuffle(game.tiles.map((t) => t.id)) : []),
    [puzzle] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onLogin = async () => {
    setAuthError("");
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const onSaveKey = async (e) => {
    e.preventDefault();
    const k = keyDraft.trim();
    if (!k) return;
    setKeySaving(true);
    try {
      if (user) {
        await saveGeminiKey(user.uid, k);
      } else {
        localStorage.setItem(LS_KEY, k);
      }
      setGeminiKey(k);
      setKeyDraft("");
      setMode("input");
    } catch (err) {
      setAuthError(err.message);
    }
    setKeySaving(false);
  };

  const onOpenHistory = async () => {
    setMode("history");
    setHistory(null);
    try {
      setHistory(await loadHistory(user.uid));
    } catch {
      setHistory([]);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const zh = inputZh.trim();
    if (!zh) return;
    setGenError("");
    setMode("loading");
    try {
      const generated = await generatePuzzle(zh, geminiKey);
      setPuzzle(generated);
      setGame(newGame(generated));
      setShake(false);
      setNudge("");
      setMode("playing");
    } catch (err) {
      setGenError(err.message);
      setMode("input");
    }
  };

  const onReplay = (h) => {
    let p;
    try {
      p = JSON.parse(h.puzzle);
    } catch {
      return; // corrupt stored record — ignore the tap
    }
    setPuzzle(p);
    setGame(newGame(p));
    setShake(false);
    setNudge("");
    setGenError("");
    setMode("playing");
  };

  const onNewSentence = () => {
    setMode("input");
    setPuzzle(null);
    setGame(null);
    setNudge("");
    setGenError("");
  };

  const onPlace = (id) => {
    setGame(placeTile(game, id));
    setNudge("");
  };
  const onRemove = (pos) => setGame(removeTile(game, pos));
  const onClear = () => setGame(clearAll(game));
  const onHint = () => {
    setGame(hint(game, puzzle));
    setNudge("");
  };
  const onCheck = () => {
    if (game.status === "correct") return; // write-once guard for addHistory
    if (game.placedIds.length === 0) {
      setNudge("先把牌排上去再檢查。");
      return;
    }
    const ng = check(game, puzzle);
    setGame(ng);
    if (ng.status === "correct") {
      if (user) {
        addHistory(user.uid, {
          zh: puzzle.zh,
          en: placedTiles(ng).map((t) => t.word).join(" "),
          stars: stars(ng),
          hints: ng.hints,
          misses: ng.misses,
          puzzle: JSON.stringify(puzzle), // string, not object — Firestore rejects nested arrays (accepted)
        }).catch(() => {}); // history write failing must not block the game
      }
    } else if (ng.wrongIdx.length) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setNudge("被標紅的塊再想一下 —— 通常卡在時態、冠詞或介係詞。");
    }
  };

  /* ---- drag to insert / reorder ----
     Pointer-based: a press becomes a drag after 6px of travel; below that it
     stays a tap (pool tap = append, placed tap = remove). Dropping outside
     the rack cancels. Locked tiles never drag (buttons are disabled). */
  const DRAG_PX = 6;
  const rackRef = useRef(null);
  const dragInfo = useRef(null); // {id, word, from, startX, startY, started}
  const suppressClick = useRef(false); // eat the click that follows a drag
  const [drag, setDrag] = useState(null); // {word, x, y, over} — render only

  const rackHit = (x, y) => {
    const r = rackRef.current?.getBoundingClientRect();
    return !!r && x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
  };

  // insertion point 0..n (n = placed count): nearest slot centre, left half
  // inserts before it, right half after. Works across wrapped rack rows.
  const insertIndex = (x, y) => {
    const n = game.placedIds.length;
    if (!rackRef.current || n === 0) return 0;
    const els = Array.from(rackRef.current.children).slice(0, n);
    let best = 0;
    let bestD = Infinity;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i + (dx > 0 ? 1 : 0);
      }
    });
    return best;
  };

  const onTilePress = (e, tile, from) => {
    if (game.status === "correct") return;
    // one drag at a time, primary pointer only — a second touch must not
    // overwrite an in-flight drag (capture isolates a pointer, not others)
    if (dragInfo.current || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragInfo.current = {
      id: tile.id,
      word: tile.word,
      from, // "pool" | placed index
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    };
  };
  const onTileDragMove = (e) => {
    const info = dragInfo.current;
    if (!info || e.pointerId !== info.pointerId) return;
    if (!info.started) {
      if (Math.hypot(e.clientX - info.startX, e.clientY - info.startY) < DRAG_PX) return;
      info.started = true;
    }
    setDrag({
      word: info.word,
      x: e.clientX,
      y: e.clientY,
      over: rackHit(e.clientX, e.clientY) ? insertIndex(e.clientX, e.clientY) : null,
    });
  };
  const onTileDragEnd = (e) => {
    const info = dragInfo.current;
    if (!info || e.pointerId !== info.pointerId) return;
    dragInfo.current = null;
    if (!info.started) return; // plain tap — let the click handler act
    setDrag(null);
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false; // drop may unmount the tile → no click to clear it
    }, 0);
    if (!rackHit(e.clientX, e.clientY)) return; // dropped outside the rack = cancel
    const ins = insertIndex(e.clientX, e.clientY);
    if (info.from === "pool") {
      if (game.placedIds.length >= puzzle.accepted[0].length) return; // rack full — cancel, like drag-out
      setGame(placeTile(game, info.id, ins));
    } else {
      // re-resolve by id: placedIds may have shifted since press (e.g. hint)
      const curFrom = game.placedIds.indexOf(info.id);
      if (curFrom === -1) return;
      setGame(moveTile(game, curFrom, ins > curFrom ? ins - 1 : ins));
    }
    setNudge("");
  };
  const onTileDragCancel = (e) => {
    const info = dragInfo.current;
    if (!info || e.pointerId !== info.pointerId) return;
    dragInfo.current = null;
    setDrag(null);
  };

  const accountBar = (
    <div className="st-account">
      {user ? (
        <>
          <button className="st-linkbtn" onClick={onOpenHistory}>歷史</button>
          <button className="st-linkbtn" onClick={() => setMode("key")}>Key</button>
          <button className="st-linkbtn" onClick={() => logout()}>登出</button>
        </>
      ) : (
        <>
          <button className="st-linkbtn" onClick={() => setMode("key")}>Key</button>
          <button className="st-linkbtn" onClick={onLogin}>登入</button>
        </>
      )}
    </div>
  );

  /* ---- boot gate: wait for auth + key resolution ---- */
  if (!authReady || !keyLoaded) {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head />
          <div className="st-loading">
            <span className="st-spinner" />
          </div>
        </div>
      </div>
    );
  }

  /* ---- history screen (before the key gate — history needs no key) ---- */
  if (mode === "history") {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head>{accountBar}</Head>
          {history === null ? (
            <div className="st-loading">
              <span className="st-spinner" />
            </div>
          ) : history.length === 0 ? (
            <p className="st-login-text">還沒有紀錄 —— 拼出第一句吧。</p>
          ) : (
            <div className="st-history">
              {history.map((h) => (
                <div className="st-hitem" key={h.id}>
                  <div className="st-hrow">
                    <span className="st-hzh">{h.zh}</span>
                    <span className="st-hstars">
                      {"★".repeat(h.stars)}
                      <span className="st-hstars-off">{"★".repeat(3 - h.stars)}</span>
                    </span>
                  </div>
                  <div className="st-hen">{h.en}</div>
                  <div className="st-hmeta">
                    <span>
                      {h.createdAt?.toDate ? h.createdAt.toDate().toLocaleString() : ""}
                    </span>
                    {h.puzzle && (
                      <button className="st-linkbtn" onClick={() => onReplay(h)}>
                        再拼一次
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="st-controls st-back-row">
            <button className="btn ghost" onClick={() => setMode("input")}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Gemini key setup (first time: no key yet; later: via Key button).
          Replay ("playing") passes through — it runs on the local engine, no key needed. ---- */
  if (mode === "key" || (!geminiKey && mode !== "playing")) {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head>{accountBar}</Head>
          <form className="st-input-form" onSubmit={onSaveKey}>
            <label className="st-input-label" htmlFor="key-input">
              貼上你的 Gemini API key
            </label>
            <input
              id="key-input"
              className="st-input-area st-key-input"
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={geminiKey ? "已設定過，貼上新的 key 可更換" : "AIza…"}
              autoFocus
            />
            <p className="st-keyhelp">
              出題用你自己的 Gemini 額度。到{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>{" "}
              免費取得。
              {user
                ? "key 只存在你的帳號資料裡。"
                : "key 只存在這台瀏覽器；登入後會改存到你的帳號。"}
            </p>
            {authError && <p className="st-gen-error">{authError}</p>}
            <div className="st-controls">
              {(geminiKey || game) && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setMode(geminiKey ? "input" : "playing")}
                >
                  返回
                </button>
              )}
              <button
                type="submit"
                className="btn solid"
                disabled={!keyDraft.trim() || keySaving}
              >
                {keySaving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ---- input screen ---- */
  if (mode === "input") {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head>{accountBar}</Head>
          <form className="st-input-form" onSubmit={onSubmit}>
            <label className="st-input-label" htmlFor="zh-input">
              輸入一個中文句子
            </label>
            <textarea
              id="zh-input"
              className="st-input-area"
              value={inputZh}
              onChange={(e) => setInputZh(e.target.value)}
              placeholder="例：我昨天忘記帶雨傘。"
              rows={3}
              autoFocus
            />
            {authError && <p className="st-gen-error">{authError}</p>}
            {genError && <p className="st-gen-error">{genError}</p>}
            <button
              type="submit"
              className="btn solid st-input-btn"
              disabled={!inputZh.trim()}
            >
              生成題目
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ---- loading screen ---- */
  if (mode === "loading") {
    return (
      <div className="st-root">
        <div className="st-board">
          <Head />
          <div className="st-loading">
            <span className="st-spinner" />
            <p>正在生成題目…</p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- playing screen ---- */
  const pool = poolTiles(game);
  const poolById = Object.fromEntries(pool.map((t) => [t.id, t]));
  const orderedPool = order.map((id) => poolById[id]).filter(Boolean);
  const placed = placedTiles(game);
  const slots = puzzle.accepted[0].length;
  const correct = game.status === "correct";

  return (
    <div className="st-root">
      <div className="st-board">
        <Head>{accountBar}</Head>

        <div className="st-prompt">
          <div className="st-chip">{puzzle.theme}</div>
          <p className="st-zh">{puzzle.zh}</p>
        </div>

        <div className={"st-rack" + (shake ? " shake" : "")} ref={rackRef}>
          {Array.from({ length: slots }).map((_, i) => {
            const t = placed[i];
            const isWrong = game.wrongIdx.includes(i);
            const locked = t && game.lockedIds.includes(t.id);
            return (
              <div
                className={
                  "st-slot" +
                  (drag && drag.over === i ? " insert" : "") +
                  (drag && drag.over === slots && i === slots - 1 ? " insert-end" : "")
                }
                key={i}
              >
                {t ? (
                  <button
                    className={
                      "tile placed" +
                      (correct ? " ok" : "") +
                      (isWrong ? " bad" : "") +
                      (locked ? " locked" : "")
                    }
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      onRemove(i);
                    }}
                    onPointerDown={(e) => onTilePress(e, t, i)}
                    onPointerMove={onTileDragMove}
                    onPointerUp={onTileDragEnd}
                    onPointerCancel={onTileDragCancel}
                    onLostPointerCapture={onTileDragCancel}
                    disabled={locked || correct}
                  >
                    {t.word}
                    {locked && <span className="lock">●</span>}
                  </button>
                ) : (
                  <span className="st-empty" />
                )}
              </div>
            );
          })}
        </div>

        <div className="st-pool">
          {orderedPool.length === 0 ? (
            <span className="st-poolhint">牌都用上了，按「檢查」看看對不對</span>
          ) : (
            orderedPool.map((t) => (
              <button
                key={t.id}
                className="tile"
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onPlace(t.id);
                }}
                onPointerDown={(e) => onTilePress(e, t, "pool")}
                onPointerMove={onTileDragMove}
                onPointerUp={onTileDragEnd}
                onPointerCancel={onTileDragCancel}
                onLostPointerCapture={onTileDragCancel}
              >
                {t.word}
              </button>
            ))
          )}
        </div>

        {drag && (
          <div className="tile st-drag-ghost" style={{ left: drag.x, top: drag.y }}>
            {drag.word}
          </div>
        )}

        {!correct ? (
          <div className="st-controls">
            <button className="btn ghost" onClick={onHint}>
              提示
            </button>
            <button className="btn ghost" onClick={onClear}>
              清除
            </button>
            <button className="btn solid" onClick={onCheck}>
              檢查
            </button>
          </div>
        ) : (
          <div className="st-controls">
            <button className="btn solid" onClick={onNewSentence}>
              再一句
            </button>
          </div>
        )}

        <p className="st-nudge" aria-live="polite">
          {!correct ? nudge : ""}
        </p>

        {correct && (
          <div className="st-result">
            <div className="st-stars">
              {[0, 1, 2].map((s) => (
                <span key={s} className={"star" + (s < stars(game) ? " fill" : "")}>
                  ★
                </span>
              ))}
              <span className="st-scoreline">
                {game.hints === 0 && game.misses === 0
                  ? "完美，沒提示也沒踩雷"
                  : `用了 ${game.hints} 次提示、錯 ${game.misses} 次`}
              </span>
            </div>
            {!user && (
              <p className="st-keyhelp">登入 Google 後，過關紀錄會存到你的帳號。</p>
            )}
            <div className="st-notes">
              {puzzle.notes.map((n, i) => (
                <div className="note" key={i} style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="note-word">{n.word}</span>
                  <span className="note-text">{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
