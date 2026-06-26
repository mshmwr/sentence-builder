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
import { PUZZLES, shuffle } from "./puzzles.js";

export default function App() {
  const [idx, setIdx] = useState(0);
  const puzzle = PUZZLES[idx];
  const [game, setGame] = useState(() => newGame(puzzle));
  const [shake, setShake] = useState(false);
  const [nudge, setNudge] = useState("");

  // stable shuffled display order, recomputed only when the puzzle changes
  const order = useMemo(
    () => shuffle(game.tiles.map((t) => t.id)),
    [idx] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const goTo = (i) => {
    setIdx(i);
    setGame(newGame(PUZZLES[i]));
    setShake(false);
    setNudge("");
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
          <div className="st-progress">
            {PUZZLES.map((_, i) => (
              <button
                key={i}
                className={"st-dot" + (i === idx ? " on" : "")}
                onClick={() => goTo(i)}
                aria-label={`第 ${i + 1} 句`}
              />
            ))}
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
            <button
              className="btn solid"
              onClick={() => goTo((idx + 1) % PUZZLES.length)}
            >
              下一句
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
