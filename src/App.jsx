import React, { useState, useMemo } from "react";
import {
  newGame,
  poolTiles,
  placedTiles,
  stars,
  placeTile,
  removeTile,
  clearAll,
  check,
  hint,
} from "./engine.js";
import { shuffle } from "./puzzles.js";
import { generatePuzzle } from "./generate.js";

export default function App() {
  const [mode, setMode] = useState("input"); // "input" | "loading" | "playing"
  const [inputZh, setInputZh] = useState("");
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [shake, setShake] = useState(false);
  const [nudge, setNudge] = useState("");
  const [genError, setGenError] = useState("");

  const order = useMemo(
    () => (game ? shuffle(game.tiles.map((t) => t.id)) : []),
    [puzzle] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    const zh = inputZh.trim();
    if (!zh) return;
    setGenError("");
    setMode("loading");
    try {
      const generated = await generatePuzzle(zh);
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
    if (game.placedIds.length === 0) {
      setNudge("先把牌排上去再檢查。");
      return;
    }
    const ng = check(game, puzzle);
    setGame(ng);
    if (ng.status === "playing" && ng.wrongIdx.length) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setNudge("被標紅的塊再想一下 —— 通常卡在時態、冠詞或介係詞。");
    }
  };

  /* ---- input screen ---- */
  if (mode === "input") {
    return (
      <div className="st-root">
        <div className="st-board">
          <header className="st-head">
            <div className="st-brand">
              <span className="st-mark">拼句</span>
              <span className="st-tag">把中文，拼成對的英文</span>
            </div>
          </header>

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
          <header className="st-head">
            <div className="st-brand">
              <span className="st-mark">拼句</span>
              <span className="st-tag">把中文，拼成對的英文</span>
            </div>
          </header>
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
        <header className="st-head">
          <div className="st-brand">
            <span className="st-mark">拼句</span>
            <span className="st-tag">把中文，拼成對的英文</span>
          </div>
        </header>

        <div className="st-prompt">
          <div className="st-chip">{puzzle.theme}</div>
          <p className="st-zh">{puzzle.zh}</p>
        </div>

        <div className={"st-rack" + (shake ? " shake" : "")}>
          {Array.from({ length: slots }).map((_, i) => {
            const t = placed[i];
            const isWrong = game.wrongIdx.includes(i);
            const locked = t && game.lockedIds.includes(t.id);
            return (
              <div className="st-slot" key={i}>
                {t ? (
                  <button
                    className={
                      "tile placed" +
                      (correct ? " ok" : "") +
                      (isWrong ? " bad" : "") +
                      (locked ? " locked" : "")
                    }
                    onClick={() => onRemove(i)}
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
              <button key={t.id} className="tile" onClick={() => onPlace(t.id)}>
                {t.word}
              </button>
            ))
          )}
        </div>

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
