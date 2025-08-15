import React, { useState, useEffect, useRef } from 'react';
import players from './players';
import './App.css';

const PUB = process.env.PUBLIC_URL;

// "A'ja Wilson" -> "ajawilson"
// "Cheyenne Parker-Tyus" -> "cheyenneparker-tyus"
const slugify = (name) => (name || '').toLowerCase().replace(/[^a-z-]/g, '');

// map team code -> filename (avoid Windows reserved "con")
const teamCodeToFile = (code) => {
  const c = (code || '').toLowerCase();
  if (c === 'con') return 'ctsun';
  return c;
};

// ====================== daily rotation & storage ======================

const DEBUG =
  new URLSearchParams(window.location.search).get('debug') === '1' ||
  localStorage.getItem('phee:debug') === '1';

function getCTParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return parts;
}
function rotationKeyFor(d = new Date()) {
  const p = getCTParts(d);
  return `CT-${p.year}-${p.month}-${p.day}`;
}
function getRotationKey() {
  if (DEBUG) {
    const p = getCTParts();
    return `CT-${p.year}-${p.month}-${p.day}-${p.hour}-${p.minute}`;
  }
  return rotationKeyFor();
}

// rng helpers
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const playersStable = [...players].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

const STORAGE_PREFIX = 'phee:v1';
const gameKeyFor = (rotationKey) => `${STORAGE_PREFIX}:game:${rotationKey}`;
const solutionKeyFor = (rotationKey) => `${STORAGE_PREFIX}:solution:${rotationKey}`;
const lockKeyFor = (rotationKey) => `${STORAGE_PREFIX}:locked:${rotationKey}`;
const STREAK_KEY = `${STORAGE_PREFIX}:streak`;
const SEEN_HELP_KEY = `${STORAGE_PREFIX}:seenHelp`;

const isLocked = (rotationKey) => localStorage.getItem(lockKeyFor(rotationKey)) === '1';

function pickSolutionFor(rotationKey) {
  const seed = xmur3(rotationKey)();
  const rand = mulberry32(seed);
  const idx = Math.floor(rand() * playersStable.length);
  return playersStable[idx];
}

// ============================================================================

function App() {
  const [playerName, setPlayerName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [message, setMessage] = useState('');
  const [guessesLeft, setGuessesLeft] = useState(8);
  const [previousGuesses, setPreviousGuesses] = useState(Array(8).fill(null));
  const [timer, setTimer] = useState(0); // count-up only
  const [showSilhouette, setShowSilhouette] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [triesTaken, setTriesTaken] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [guessedPlayers, setGuessedPlayers] = useState([]);
  const [showHelp, setShowHelp] = useState(false);

  // reveal stuff
  const [showActualPortrait, setShowActualPortrait] = useState(false);
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  const [portraitModalDismissed, setPortraitModalDismissed] = useState(false);

  // streak
  const [streak, setStreak] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
      return { count: s?.count || 0, max: s?.max || 0, lastKey: s?.lastKey || null };
    } catch { return { count: 0, max: 0, lastKey: null }; }
  });

  const intervalRef = useRef(null);
  const meterRef = useRef(null);
  const prevGuessesRef = useRef(guessesLeft);

  // rotation key (changes at midnight CT; every minute in DEBUG)
  const [rotationKey, setRotationKey] = useState(getRotationKey());
  useEffect(() => {
    const tick = setInterval(() => {
      const nextKey = getRotationKey();
      setRotationKey((prev) => (prev === nextKey ? prev : nextKey));
    }, DEBUG ? 5_000 : 60_000);
    return () => clearInterval(tick);
  }, []);

  // open help on first visit
  useEffect(() => {
    const seen = localStorage.getItem(SEEN_HELP_KEY);
    if (!seen) {
      setShowHelp(true);
      try { localStorage.setItem(SEEN_HELP_KEY, '1'); } catch {}
    }
  }, []);

  // pick today's player + hydrate state
  useEffect(() => {
    if (!rotationKey) return;

    // ensure today's solution
    const solKey = solutionKeyFor(rotationKey);
    let storedSolution = null;
    try {
      const rawSol = localStorage.getItem(solKey);
      storedSolution = rawSol ? JSON.parse(rawSol) : null;
    } catch {}
    if (!storedSolution) {
      storedSolution = pickSolutionFor(rotationKey);
      try { localStorage.setItem(solKey, JSON.stringify(storedSolution)); } catch {}
    }
    setSelectedPlayer(storedSolution);

    // hydrate game
    const gKey = gameKeyFor(rotationKey);
    const locked = isLocked(rotationKey);

    try {
      const raw = localStorage.getItem(gKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.guessesLeft === 'number') setGuessesLeft(s.guessesLeft);
        if (Array.isArray(s.previousGuesses)) setPreviousGuesses(s.previousGuesses);
        if (typeof s.gameOver === 'boolean') setGameOver(s.gameOver || locked);
        if (typeof s.message === 'string') setMessage(s.message);
        if (typeof s.triesTaken === 'number') setTriesTaken(s.triesTaken);
        if (Array.isArray(s.guessedPlayers)) setGuessedPlayers(s.guessedPlayers);

        const savedAt = s.timerSavedAt ?? Date.now();
        const delta = Math.floor((Date.now() - savedAt) / 1000);
        const base = typeof s.timer === 'number' ? s.timer : 0;
        const t = (s.gameOver || locked) ? base : base + delta;
        setTimer(t);

        if (locked || s.gameOver) {
          setShowActualPortrait(true);
          setShowPortraitModal(false);
          setPortraitModalDismissed(true);
        }
      } else {
        if (locked) {
          setGameOver(true);
          setShowActualPortrait(true);
          setShowPortraitModal(false);
          setPortraitModalDismissed(true);
          setMessage('✅ Already completed for today.');
        } else {
          resetGameState();
        }
      }
    } catch {
      resetGameState();
    }

    // timer loop
    startTimer();

    // tidy old saves
    Object.keys(localStorage)
      .filter(k => k.startsWith(`${STORAGE_PREFIX}:game:`) && k !== gKey)
      .forEach(k => localStorage.removeItem(k));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationKey]);

  // persist today's game
  useEffect(() => {
    if (!rotationKey) return;
    const gKey = gameKeyFor(rotationKey);
    const gameState = {
      guessesLeft,
      previousGuesses,
      gameOver,
      message,
      triesTaken,
      guessedPlayers,
      timer,
      timerSavedAt: Date.now(),
      version: 2,
      savedAt: Date.now(),
    };
    try { localStorage.setItem(gKey, JSON.stringify(gameState)); } catch {}
  }, [rotationKey, guessesLeft, previousGuesses, gameOver, message, triesTaken, guessedPlayers, timer]);

  // persist streak
  useEffect(() => {
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); } catch {}
  }, [streak]);

  const resetGameState = () => {
    if (isLocked(rotationKey) && !DEBUG) return;
    setGuessesLeft(8);
    setPreviousGuesses(Array(8).fill(null));
    setGameOver(false);
    setMessage('');
    setTriesTaken(0);
    setGuessedPlayers([]);
    setShowSilhouette(false);
    setShowActualPortrait(false);
    setShowPortraitModal(false);
    setPortraitModalDismissed(false);
    setTimer(0);
    startTimer();
  };

  const capitalizeName = (name) => {
    return name.split(' ').map(part => {
      return part.split('-').map(subPart => {
        if (subPart.toLowerCase().startsWith('mc')) {
          return 'Mc' + subPart.charAt(2).toUpperCase() + subPart.slice(3).toLowerCase();
        }
        return subPart.charAt(0).toUpperCase() + subPart.slice(1).toLowerCase();
      }).join('-');
    }).join(' ');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPlayer || guessesLeft <= 0 || gameOver) return;

    const correctedPlayerName = capitalizeName(playerName);
    if (guessedPlayers.includes(correctedPlayerName)) {
      setMessage("❌ You've already guessed this player! Try a different name.");
      setPlayerName('');
      return;
    }

    const foundPlayer = players.find(p => p.name.toLowerCase().trim() === correctedPlayerName.toLowerCase().trim());

    setTriesTaken(prev => prev + 1);

    if (foundPlayer) {
      const guessFeedback = getGuessFeedback(foundPlayer);
      const updatedGuesses = [...previousGuesses];
      const emptyIndex = updatedGuesses.findIndex(guess => guess === null);
      if (emptyIndex !== -1) {
        updatedGuesses[emptyIndex] = { guess: correctedPlayerName, feedback: guessFeedback };
      }
      setPreviousGuesses(updatedGuesses);

      if (foundPlayer.id === selectedPlayer.id) {
        setShowSilhouette(true);
        handleGameEnd(true, `🎉 Correct! The player was ${selectedPlayer.name}!`);
      } else {
        setGuessedPlayers(prev => [...prev, correctedPlayerName]);
        setGuessesLeft(prev => (prev > 0 ? prev - 1 : 0));
        setMessage("❌ Incorrect! Try again.");
        if (guessesLeft <= 1) {
          handleGameEnd(false, `Game Over! The correct player was ${selectedPlayer.name}.`);
        }
      }
    } else {
      setMessage("❌ Player not found! Make sure you're guessing the correct name.");
      if (guessesLeft <= 1) {
        handleGameEnd(false, `Game Over! The correct player was ${selectedPlayer.name}.`);
      }
    }

    setPlayerName('');
    setShowSuggestions(false);
  };

  const getGuessFeedback = (guessedPlayer) => {
    let feedback = {};

    // team
    feedback.team = guessedPlayer.team === selectedPlayer.team
      ? `${guessedPlayer.team} ✅`
      : selectedPlayer.previousTeams?.includes(guessedPlayer.team)
        ? `${guessedPlayer.team} 🟡`
        : `${guessedPlayer.team} ❌`;

    // position
    const guessedPositionParts = guessedPlayer.position.split('-');
    const selectedPositionParts = selectedPlayer.position.split('-');
    const positionMatch = guessedPositionParts.some(pos => selectedPositionParts.includes(pos));
    feedback.position = guessedPlayer.position === selectedPlayer.position ? '✅' : (positionMatch ? '🟡' : '❌');
    feedback.positionText = guessedPlayer.position;

    // conf
    feedback.confText = `${guessedPlayer.conf} ${guessedPlayer.conf === selectedPlayer.conf ? '✅' : '❌'}`;
    feedback.conf = guessedPlayer.conf === selectedPlayer.conf ? '✅' : '❌';

    // height
    const parseHeight = (height) => {
      const [feet, inches] = height.split("'").map((part) => parseInt(part.trim(), 10));
      return (feet * 12) + inches;
    };
    const guessedHeightInches = parseHeight(guessedPlayer.height);
    const selectedHeightInches = parseHeight(selectedPlayer.height);
    const heightDiff = Math.abs(guessedHeightInches - selectedHeightInches);
    feedback.height = {
      value: guessedHeightInches === selectedHeightInches ? guessedPlayer.height : `${guessedPlayer.height}`,
      emoji: guessedHeightInches === selectedHeightInches ? '✅' : (heightDiff <= 2 ? '🟡' : (guessedHeightInches < selectedHeightInches ? '⬆️' : '⬇️')),
      className: guessedHeightInches === selectedHeightInches ? '' : (heightDiff <= 2 ? 'yellow' : (guessedHeightInches < selectedHeightInches ? 'arrow-up' : 'arrow-down')),
    };

    // age
    const ageDiff = Math.abs(guessedPlayer.age - selectedPlayer.age);
    feedback.age = {
      value: guessedPlayer.age === selectedPlayer.age ? guessedPlayer.age : `${guessedPlayer.age}`,
      emoji: guessedPlayer.age === selectedPlayer.age ? '✅' : (ageDiff <= 2 ? '🟡' : (guessedPlayer.age < selectedPlayer.age ? '⬆️' : '⬇️')),
      className: guessedPlayer.age === selectedPlayer.age ? '' : (ageDiff <= 2 ? 'yellow' : (guessedPlayer.age < selectedPlayer.age ? 'arrow-up' : 'arrow-down')),
    };

    // number
    const guessedNumber = parseInt(guessedPlayer.number, 10);
    const selectedNumber = parseInt(selectedPlayer.number, 10);
    const numberDiff = Math.abs(guessedNumber - selectedNumber);
    feedback.numberMatch = {
      value: guessedNumber === selectedNumber ? guessedNumber : `${guessedNumber}`,
      emoji: guessedNumber === selectedNumber ? '✅' : (numberDiff <= 2 ? '🟡' : (guessedNumber < selectedNumber ? '⬆️' : '⬇️')),
      className: guessedNumber === selectedNumber ? '' : (numberDiff <= 2 ? 'yellow' : (guessedNumber < selectedNumber ? 'arrow-up' : 'arrow-down')),
    };

    return feedback;
  };

  const startTimer = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
  };

  const handlePlayAgain = () => {
    if (!DEBUG) return;
    try { localStorage.removeItem(lockKeyFor(rotationKey)); } catch {}
    resetGameState();
  };

  // streak update
  const prevRotationKey = () => rotationKeyFor(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const handleGameEnd = (won, msg) => {
    clearInterval(intervalRef.current);
    setMessage(msg);
    setGameOver(true);
    setShowActualPortrait(true);
    try { localStorage.setItem(lockKeyFor(rotationKey), '1'); } catch {}

    // streak logic
    setStreak((cur) => {
      if (won) {
        if (cur.lastKey === rotationKey) return { ...cur, lastKey: rotationKey };
        const isConsecutive = cur.lastKey === prevRotationKey();
        const nextCount = isConsecutive ? (cur.count + 1) : 1;
        const nextMax = Math.max(cur.max, nextCount);
        return { count: nextCount, max: nextMax, lastKey: rotationKey };
      } else {
        return { count: 0, max: Math.max(cur.max, cur.count), lastKey: rotationKey };
      }
    });

    // show the win modal w/ image
    setShowPortraitModal(true);
    setPortraitModalDismissed(false);
  };

  // pill meter bounce on wrong guess
  useEffect(() => {
    if (!meterRef.current) return;
    const prev = prevGuessesRef.current;
    if (guessesLeft < prev) {
      const el = meterRef.current;
      el.classList.remove('hit');
      // restart animation
      // eslint-disable-next-line no-unused-expressions
      el.offsetWidth;
      el.classList.add('hit');
    }
    prevGuessesRef.current = guessesLeft;
  }, [guessesLeft]);

  const getEmoji = (feedback, type) => {
    if (type === 'team' || type === 'position' || type === 'conf') {
      if (feedback.includes('✅')) return '🟩';
      if (feedback.includes('🟡')) return '🟨';
      return '⬛';
    }
    if (type === 'height' || type === 'age' || type === 'number') {
      if (feedback.emoji === '✅') return '🟩';
      if (feedback.emoji === '⬆️' || feedback.emoji === '⬇️') return '🟨';
      return '⬛';
    }
    return '⬛';
  };

  const formatShareText = () => {
    const gameNumber = rotationKey;
    const guessesUsed = triesTaken;
    const maxGuesses = previousGuesses.length;
    const win = gameOver && message.includes('Correct!');
    const guessCount = win ? guessesUsed : 'X';

    let result = `PHEE ${gameNumber} ${guessCount}/${maxGuesses}\n\n`;

    previousGuesses.forEach((guess) => {
      if (guess) {
        result += [
          getEmoji(guess.feedback.team, 'team'),
          getEmoji(guess.feedback.position, 'position'),
          getEmoji(guess.feedback.conf, 'conf'),
          getEmoji(guess.feedback.height, 'height'),
          getEmoji(guess.feedback.age, 'age'),
          getEmoji(guess.feedback.numberMatch, 'number')
        ].join('') + '\n';
      }
    });

    return result.trim();
  };

  const handleShare = async () => {
    const shareText = formatShareText();
    try {
      await navigator.clipboard.writeText(shareText);
      setMessage('✅ Result copied to clipboard!');
      setShowActualPortrait(true);
    } catch (err) {
      setMessage('❌ Could not copy to clipboard.');
    }
  };

  // timer loop: pause when game over
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!selectedPlayer || gameOver) return;

    intervalRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [selectedPlayer, gameOver]);

  useEffect(() => {
    if (gameOver) clearInterval(intervalRef.current);
  }, [gameOver]);

  return (
    <div className="App">
      <div className="fade-in-main">
        {/* help icon */}
        <div
          className="help-icon"
          onClick={() => setShowHelp(true)}
          title="How to play"
        >
          ?
        </div>

        {/* help modal (auto-opens first visit) */}
        {showHelp && (
          <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
            <div className="help-modal" onClick={e => e.stopPropagation()}>
              <button
                className="help-modal-close"
                onClick={() => setShowHelp(false)}
                aria-label="Close"
              >×</button>
              <h2>How to Play</h2>
              <ul>
                <li><b>Guess</b>: Enter the full name of a player and click Guess.</li>
                <li><b>Silhouette</b>: You can show/hide the silhouette/headshot.</li>
                <li><b>Hints</b>: Team/Pos/Conf/Ht/Age/# give ✅ 🟡 or arrows.</li>
              </ul>
              <p>Daily reset at midnight CT. Good luck.</p>
            </div>
          </div>
        )}

        {/* ✅ portrait modal on win/lose reveal */}
        {showPortraitModal && selectedPlayer && (
          <div
            className="help-modal-overlay"
            onClick={() => { setShowPortraitModal(false); setPortraitModalDismissed(true); }}
          >
            <div className="help-modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
              <button
                className="help-modal-close"
                onClick={() => { setShowPortraitModal(false); setPortraitModalDismissed(true); }}
                aria-label="Close"
              >×</button>
              <h2>Player Revealed</h2>
              <img
                src={`${PUB}/images/${slugify(selectedPlayer.name)}-actual.png`}
                alt={selectedPlayer.name}
                className="actual"
                style={{ maxWidth: '100%', height: 'auto', margin: '16px 0' }}
              />
              <div style={{ fontWeight: 500, fontSize: 18 }}>{selectedPlayer?.name}</div>
            </div>
          </div>
        )}

        <h1>PHEE</h1>

        {/* streak */}
        <div className="streak-wrap">
          <div className="streak-chip">
            🔥 Streak: <b>{streak.count}</b>
            <span className="streak-max">best {streak.max}</span>
          </div>
        </div>

        {/* guesses left — 8-pill meter */}
        <div
          ref={meterRef}
          className={`guesses-meter ${guessesLeft <= 2 ? 'danger' : ''}`}
          role="progressbar"
          aria-valuenow={guessesLeft}
          aria-valuemin={0}
          aria-valuemax={8}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`gm-seg ${i < guessesLeft ? 'on' : 'off'} ${i === guessesLeft - 1 && guessesLeft > 0 ? 'last' : ''}`}
            />
          ))}
          <div className="gm-label">{guessesLeft}</div>
        </div>

        {/* shot clock */}
        <div style={{ margin: '8px 0 16px' }}>
          <ShotClock seconds={timer} />
        </div>

        {!gameOver && guessesLeft > 0 ? (
          <form onSubmit={handleSubmit}>
            <div className="search-container">
              <input
                type="text"
                placeholder="Enter full player name"
                value={playerName}
                onChange={e => { setPlayerName(e.target.value); setShowSuggestions(true); }}
                disabled={gameOver || guessesLeft <= 0}
                className={gameOver || guessesLeft <= 0 ? 'disabled-input' : ''}
              />
              {playerName && (
                <div className={`suggestions${showSuggestions ? ' open' : ''}`}>
                  {showSuggestions && (() => {
                    const input = playerName.toLowerCase();
                    const startsWith = [];
                    const contains = [];
                    players.forEach(player => {
                      const name = player.name.toLowerCase();
                      if (!guessedPlayers.includes(player.name) && name.includes(input)) {
                        if (name.startsWith(input)) startsWith.push(player);
                        else contains.push(player);
                      }
                    });
                    const suggestions = [...startsWith, ...contains];
                    return suggestions.slice(0, 2).map((suggestion, idx) => (
                      <div
                        className="suggestion"
                        key={idx}
                        onClick={() => { setPlayerName(suggestion.name); setShowSuggestions(false); }}
                      >
                        {suggestion.name}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <button type="submit" disabled={gameOver || guessesLeft <= 0}>Guess</button>
          </form>
        ) : (
          <div>
            {gameOver && (
              <div>
                <p>{guessesLeft === 0 ? `Game Over! The correct player was ${selectedPlayer?.name}.` : message}</p>
                {DEBUG ? (
                  <button onClick={handlePlayAgain}>Play Again (debug)</button>
                ) : (
                  <button disabled title="Come back after midnight CT for a new player">Play Again</button>
                )}
                <button onClick={handleShare} style={{ marginLeft: 8 }}>Share Result</button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setShowSilhouette(prev => !prev)}
          disabled={gameOver || guessesLeft <= 0}
          className={gameOver || guessesLeft <= 0 ? 'disabled-button' : 'silhouette-button'}
        >
          {showSilhouette ? 'Hide Silhouette' : 'Show Silhouette'}
        </button>

        {selectedPlayer && (
          <div className="silhouette-container">
            {showSilhouette && !showActualPortrait && (
              <img
                src={`${PUB}/images/${slugify(selectedPlayer.name)}-headshot.png`}
                alt="Player silhouette"
                className="silhouette"
              />
            )}
            {gameOver && portraitModalDismissed && (
              <img
                src={`${PUB}/images/${slugify(selectedPlayer.name)}-actual.png`}
                alt="Player actual"
                className="actual"
              />
            )}
          </div>
        )}

        <div className="game-info">
          <h3>Previous Guesses:</h3>
          <div className="info-box">
            <div className="info-box-inner">
              {/* desktop header */}
              <div className="info-item-wrapper title">
                <div className="info-label">Name</div>
                <div className="info-label">Team</div>
                <div className="info-label">Pos</div>
                <div className="info-label">Conf</div>
                <div className="info-label">Ht</div>
                <div className="info-label">Age</div>
                <div className="info-label">#</div>
              </div>

              {/* mobile header */}
              <div className="mobile-grid-head" aria-hidden="true">
                <div>Team</div><div>Pos</div><div>Conf</div>
                <div>Ht</div><div>Age</div><div>#</div>
              </div>

              {previousGuesses.map((prevGuess, index) => (
                <div
                  key={index}
                  className={`info-item-wrapper guess${
                    prevGuess && prevGuess.guess === selectedPlayer?.name
                      ? ' correct-row'
                      : prevGuess && prevGuess.guess
                        ? ' accent-row'
                        : ''
                  }`}
                >
                  <div className="info-item name-cell">
                    {prevGuess ? prevGuess.guess : ''}
                  </div>

                  <div className={`info-item ${prevGuess ? getFeedbackClassTeam(prevGuess.feedback.team) : ''} team-cell`}>
                    {prevGuess && (
                      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%'}}>
                        {(() => {
                          const code = prevGuess?.feedback?.team
                            ? prevGuess.feedback.team.split(' ')[0]
                            : '';
                          const file = teamCodeToFile(code);
                          return (
                            <img
                              src={`${PUB}/logos/${file}.png`}
                              alt={code}
                              style={{height: 24, marginBottom: 2, objectFit: 'contain'}}
                            />
                          );
                        })()}
                        <span style={{fontSize: '1em', marginTop: 2}}>
                          {prevGuess?.feedback?.team ? prevGuess.feedback.team.split(' ')[0] : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className={`info-item ${prevGuess ? getFeedbackClassSimple(prevGuess.feedback.position) : ''} pos-cell`}>
                    {prevGuess ? prevGuess.feedback.positionText : ''}
                  </div>

                  <div className={`info-item ${prevGuess ? getFeedbackClassSimple(prevGuess.feedback.conf) : ''} conf-cell`}>
                    {prevGuess ? (prevGuess.feedback.confText ? prevGuess.feedback.confText.split(' ')[0] : '') : ''}
                  </div>

                  <div className={`info-item ht-cell ${prevGuess ? getFeedbackClass(prevGuess.feedback.height) : ''}`}>
                    {prevGuess ? prevGuess.feedback.height.value : ''}
                    {prevGuess && (prevGuess.feedback.height.emoji === '⬆️' || prevGuess.feedback.height.emoji === '⬇️') && (
                      <span className={prevGuess.feedback.height.emoji === '⬆️' ? 'arrow-up' : 'arrow-down'}>
                        {prevGuess.feedback.height.emoji}
                      </span>
                    )}
                  </div>

                  <div className={`info-item age-cell ${prevGuess ? getFeedbackClass(prevGuess.feedback.age) : ''}`}>
                    {prevGuess ? prevGuess.feedback.age.value : ''}
                    {prevGuess && (prevGuess.feedback.age.emoji === '⬆️' || prevGuess.feedback.age.emoji === '⬇️') && (
                      <span className={prevGuess.feedback.age.emoji === '⬆️' ? 'arrow-up' : 'arrow-down'}>
                        {prevGuess.feedback.age.emoji}
                      </span>
                    )}
                  </div>

                  <div className={`info-item num-cell ${prevGuess ? getFeedbackClass(prevGuess.feedback.numberMatch) : ''}`}>
                    {prevGuess ? prevGuess.feedback.numberMatch.value : ''}
                    {prevGuess && (prevGuess.feedback.numberMatch.emoji === '⬆️' || prevGuess.feedback.numberMatch.emoji === '⬇️') && (
                      <span className={prevGuess.feedback.numberMatch.emoji === '⬆️' ? 'arrow-up' : 'arrow-down'}>
                        {prevGuess.feedback.numberMatch.emoji}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>        
    </div>
  );
}

function getFeedbackClass(feedback) {
  if (!feedback) return 'incorrect';
  if (feedback.emoji === '✅') return 'correct';
  if (feedback.emoji === '🟡') return 'close';
  return 'incorrect';
}
function getFeedbackClassTeam(feedback) {
  if (!feedback) return 'incorrect';
  if (feedback.includes('✅')) return 'correct';
  if (feedback.includes('🟡')) return 'close';
  return 'incorrect';
}
function getFeedbackClassSimple(feedback) {
  if (!feedback) return 'incorrect';
  if (feedback === '✅') return 'correct';
  if (feedback === '🟡') return 'close';
  return 'incorrect';
}

/* MM:SS shot clock (uses .shot-clock styles) */
function ShotClock({ seconds = 0 }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <div className="shot-clock" aria-label="Timer">
      <span className="digits">
        {String(mins).padStart(2, '0')}
        <span className="blinking-colon">:</span>
        {String(secs).padStart(2, '0')}
      </span>
    </div>
  );
}

export default App;
