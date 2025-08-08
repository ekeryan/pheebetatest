import React, { useState, useEffect, useRef } from 'react';
import players from './players';
import './App.css';

function App() {
  const [playerName, setPlayerName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [message, setMessage] = useState('');
  const [guessesLeft, setGuessesLeft] = useState(8);
  const [previousGuesses, setPreviousGuesses] = useState(Array(8).fill(null));
  const [timer, setTimer] = useState(0);
  const [showSilhouette, setShowSilhouette] = useState(false);
  const [showJumpshot, setShowJumpshot] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [triesTaken, setTriesTaken] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [guessedPlayers, setGuessedPlayers] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showActualPortrait, setShowActualPortrait] = useState(false);
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  const [portraitModalDismissed, setPortraitModalDismissed] = useState(false);
  const [gameMode, setGameMode] = useState('normal'); // 'normal' or 'speed'
  const intervalRef = useRef(null);

  // Set timer based on mode
  useEffect(() => {
    setTimer(gameMode === 'speed' ? 60 : 0);
  }, [gameMode]);

  useEffect(() => {
    const storedPlayerData = localStorage.getItem('selectedPlayer');
    const storedPlayer = storedPlayerData ? JSON.parse(storedPlayerData) : null;
    const storedTime = localStorage.getItem('selectedPlayerTime');
    const storedGameState = localStorage.getItem('gameState');

    const currentTime = new Date().getTime();
    const oneMinute = 60 * 1000;

    if (storedPlayer && storedTime && (currentTime - parseInt(storedTime, 10)) < oneMinute) {
      setSelectedPlayer(storedPlayer);
      if (storedGameState) {
        const gameState = JSON.parse(storedGameState);
        setGuessesLeft(gameState.guessesLeft);
        setPreviousGuesses(gameState.previousGuesses);
        setGameOver(gameState.gameOver);
        setMessage(gameState.message);
        setTriesTaken(gameState.triesTaken);
        setGuessedPlayers(gameState.guessedPlayers);
        setShowActualPortrait(gameState.gameOver);
      }
    } else {
      selectNewPlayer();
    }

    startTimer();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const gameState = {
      guessesLeft,
      previousGuesses,
      gameOver,
      message,
      triesTaken,
      guessedPlayers,
    };
    localStorage.setItem('gameState', JSON.stringify(gameState));
  }, [guessesLeft, previousGuesses, gameOver, message, triesTaken, guessedPlayers]);

  const selectNewPlayer = () => {
    const randomPlayer = players[Math.floor(Math.random() * players.length)];
    setSelectedPlayer(randomPlayer);
    const currentTime = new Date().getTime();
    localStorage.setItem('selectedPlayer', JSON.stringify(randomPlayer));
    localStorage.setItem('selectedPlayerTime', currentTime.toString());
    resetGameState();
  };

  const resetGameState = () => {
    setGuessesLeft(8);
    setPreviousGuesses(Array(8).fill(null));
    setGameOver(false);
    setMessage('');
    setTriesTaken(0);
    setGuessedPlayers([]);
    setShowSilhouette(false);
    setShowJumpshot(false);
    setShowActualPortrait(false);
    setShowPortraitModal(false);
    setPortraitModalDismissed(false);
    setTimer(gameMode === 'speed' ? 60 : 0);
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
    if (!selectedPlayer || guessesLeft <= 0) return;

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
        handleGameEnd(`🎉 Correct! The player was ${selectedPlayer.name}!`);
      } else {
        setGuessedPlayers(prev => [...prev, correctedPlayerName]);
        setGuessesLeft(prev => prev > 0 ? prev - 1 : 0);
        setMessage("❌ Incorrect! Try again.");

        // Only call Game Over if this was the last guess AND not correct
        if (guessesLeft <= 1) {
          handleGameEnd(`Game Over! The correct player was ${selectedPlayer.name}.`);
        }
      }
    } else {
      setMessage("❌ Player not found! Make sure you're guessing the correct name.");

      // Only call Game Over if this was the last guess AND not correct
      if (guessesLeft <= 1) {
        handleGameEnd(`Game Over! The correct player was ${selectedPlayer.name}.`);
      }
    }

    setPlayerName('');
    setShowSuggestions(false);
  };

  const getGuessFeedback = (guessedPlayer) => {
    let feedback = {};

    // Team feedback
    feedback.team = guessedPlayer.team === selectedPlayer.team
      ? `${guessedPlayer.team} ✅`
      : selectedPlayer.previousTeams?.includes(guessedPlayer.team)
        ? `${guessedPlayer.team} 🟡`
        : `${guessedPlayer.team} ❌`;

    // Position feedback
    const guessedPositionParts = guessedPlayer.position.split('-');
    const selectedPositionParts = selectedPlayer.position.split('-');
    const positionMatch = guessedPositionParts.some(pos => selectedPositionParts.includes(pos));

    feedback.position = guessedPlayer.position === selectedPlayer.position
      ? '✅'
      : positionMatch
        ? '🟡'
        : '❌';

    feedback.positionText = guessedPlayer.position;

    // Conference feedback
    feedback.confText = `${guessedPlayer.conf} ${guessedPlayer.conf === selectedPlayer.conf ? '✅' : '❌'}`;
    feedback.conf = guessedPlayer.conf === selectedPlayer.conf ? '✅' : '❌';

    // Height feedback
    const parseHeight = (height) => {
      const [feet, inches] = height.split("'").map((part) => parseInt(part.trim(), 10));
      return (feet * 12) + inches;
    };

    const guessedHeightInches = parseHeight(guessedPlayer.height);
    const selectedHeightInches = parseHeight(selectedPlayer.height);
    const heightDiff = Math.abs(guessedHeightInches - selectedHeightInches);

    feedback.height = {
      value: guessedHeightInches === selectedHeightInches ? guessedPlayer.height : `${guessedPlayer.height}`,
      emoji: guessedHeightInches === selectedHeightInches
        ? '✅'
        : heightDiff <= 2
          ? '🟡'
          : guessedHeightInches < selectedHeightInches
            ? '⬆️'
            : '⬇️',
      className: guessedHeightInches === selectedHeightInches
        ? ''
        : heightDiff <= 2
          ? 'yellow'
          : guessedHeightInches < selectedHeightInches
            ? 'arrow-up'
            : 'arrow-down',
    };

    // Age feedback
    const ageDiff = Math.abs(guessedPlayer.age - selectedPlayer.age);
    feedback.age = {
      value: guessedPlayer.age === selectedPlayer.age ? guessedPlayer.age : `${guessedPlayer.age}`,
      emoji: guessedPlayer.age === selectedPlayer.age
        ? '✅'
        : ageDiff <= 2
          ? '🟡'
          : guessedPlayer.age < selectedPlayer.age
            ? '⬆️'
            : '⬇️',
      className: guessedPlayer.age === selectedPlayer.age
        ? ''
        : ageDiff <= 2
          ? 'yellow'
          : guessedPlayer.age < selectedPlayer.age
            ? 'arrow-up'
            : 'arrow-down',
    };

    // Number feedback
    const guessedNumber = parseInt(guessedPlayer.number, 10);
    const selectedNumber = parseInt(selectedPlayer.number, 10);
    const numberDiff = Math.abs(guessedNumber - selectedNumber);

    feedback.numberMatch = {
      value: guessedNumber === selectedNumber ? guessedNumber : `${guessedNumber}`,
      emoji: guessedNumber === selectedNumber
        ? '✅'
        : numberDiff <= 2
          ? '🟡'
          : guessedNumber < selectedNumber
            ? '⬆️'
            : '⬇️',
      className: guessedNumber === selectedNumber
        ? ''
        : numberDiff <= 2
          ? 'yellow'
          : guessedNumber < selectedPlayer.number
            ? 'arrow-up'
            : 'arrow-down',
    };

    return feedback;
  };

  const formatTime = (timeInSeconds) => {
    const hours = String(Math.floor(timeInSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((timeInSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(timeInSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const startTimer = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (gameMode === 'speed') {
          return prev > 0 ? prev - 1 : 0;
        } else {
          return prev + 1;
        }
      });
    }, 1000);
  };

  // End game if timer hits 0 in speed mode
  useEffect(() => {
    if (gameMode === 'speed' && timer === 0 && !gameOver) {
      handleGameEnd(`⏰ Time's up! The correct player was ${selectedPlayer?.name}.`);
    }
  }, [timer, gameMode, gameOver, selectedPlayer]);

  const handlePlayAgain = () => {
    setGuessesLeft(8);
    setPreviousGuesses(Array(8).fill(null));
    setGameOver(false);
    setMessage('');
    setTriesTaken(0);
    setGuessedPlayers([]);
    setShowSilhouette(false);
    setShowJumpshot(false);
    setShowActualPortrait(false);
    setShowPortraitModal(false);
    setPortraitModalDismissed(false);
    setTimer(gameMode === 'speed' ? 60 : 0);
    startTimer();
  };

  const handlePlayerNameChange = (e) => {
    setPlayerName(e.target.value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (suggestion) => {
    setPlayerName(suggestion);
    setShowSuggestions(false);
  };

  const handleGameEnd = (message) => {
    clearInterval(intervalRef.current);
    setMessage(message);
    setGameOver(true);
    setShowActualPortrait(true);
    setShowPortraitModal(true);
    setPortraitModalDismissed(false);
    localStorage.setItem('gameEnded', 'true');
    localStorage.setItem('gameEndedTime', new Date().getTime().toString());
  };

  // --- Share Feature ---
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
    const gameNumber = 1;
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
  // --- End Share Feature ---

  // Start timer when selectedPlayer or gameMode changes
  useEffect(() => {
    if (selectedPlayer) {
      clearInterval(intervalRef.current);
      setTimer(gameMode === 'speed' ? 60 : 0);
      intervalRef.current = setInterval(() => {
        setTimer(prev => {
          if (gameMode === 'speed') {
            return prev > 0 ? prev - 1 : 0;
          } else {
            return prev + 1;
          }
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [selectedPlayer, gameMode]);

  return (
    <div className="App">
      <div className="fade-in-main">
        {/* Help Icon */}
        <div
          className="help-icon"
          onClick={() => setShowHelp(true)}
          title="How to play"
        >
          ?
        </div>

        {/* Help Modal */}
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
                <li>
                  <b>Guess</b>: Enter the full name of a player and click Guess to see if you are correct.
                </li>
                <li>
                  <b>Show/Hide Silhouette</b>: Toggle to reveal or hide the silhouette/headshot of the player.
                </li>
                <li>
                  <b>Show/Hide Jumpshot</b>: Toggle to reveal or hide the player's jumpshot video (if available).
                </li>
              </ul>
              <p>
                <b>Note:</b> Not all players have a jumpshot clip yet. If the video is black, it means the jumpshot is not available. We'll be adding more jumpshot clips in future updates!
              </p>
            </div>
          </div>
        )}

        {/* Portrait Modal */}
        {showPortraitModal && selectedPlayer && (
          <div className="help-modal-overlay" onClick={() => {
            setShowPortraitModal(false);
            setPortraitModalDismissed(true);
          }}>
            <div className="help-modal" onClick={e => e.stopPropagation()} style={{textAlign: 'center'}}>
              <button
                className="help-modal-close"
                onClick={() => {
                  setShowPortraitModal(false);
                  setPortraitModalDismissed(true);
                }}
                aria-label="Close"
              >×</button>
              <h2>Player Revealed</h2>
              <img
                src={`/images/${selectedPlayer.name.toLowerCase().replace(" ", "")}-actual.png`}
                alt="Player actual"
                className="actual"
                style={{maxWidth: '100%', height: 'auto', margin: '16px 0'}}
              />
              <div style={{fontWeight: 500, fontSize: 18}}>{selectedPlayer?.name}</div>
            </div>
          </div>
        )}

        <h1>PHEE</h1>

        <div className="mode-switch-container">
          <span className={gameMode === 'normal' ? 'active' : ''}>Normal</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={gameMode === 'speed'}
              onChange={() => setGameMode(gameMode === 'normal' ? 'speed' : 'normal')}
            />
            <span className="slider"></span>
          </label>
          <span className={gameMode === 'speed' ? 'active' : ''}>Speed</span>
        </div>

        <div className="guesses-health-bar-outer">
          <div
            className={`guesses-health-bar-inner${guessesLeft <= 2 ? ' glow' : ''}`}
            style={{
              width: `${(guessesLeft / 8) * 100}%`,
              backgroundColor: '#FF5910',
              position: 'relative'
            }}
          >
            <span className="guesses-bar-label">{guessesLeft}</span>
          </div>
        </div>
        <p>
          Time: {gameMode === 'speed' ? `00:00:${String(timer).padStart(2, '0')}` : formatTime(timer)}
        </p>

        {!gameOver && guessesLeft > 0 ? (
          <form onSubmit={handleSubmit}>
            <div className="search-container">
              <input
                type="text"
                placeholder="Enter full player name"
                value={playerName}
                onChange={handlePlayerNameChange}
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
                        if (name.startsWith(input)) {
                          startsWith.push(player);
                        } else {
                          contains.push(player);
                        }
                      }
                    });
                    const suggestions = [...startsWith, ...contains];
                    return suggestions.slice(0, 2).map((suggestion, idx) => (
                      <div
                        className="suggestion"
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion.name)}
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
                <button onClick={handlePlayAgain}>Play Again</button>
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

        <button
          onClick={() => setShowJumpshot(prev => !prev)}
          disabled={gameOver || guessesLeft <= 0}
          className={gameOver || guessesLeft <= 0 ? 'disabled-button' : 'jumpshot-button'}
        >
          {showJumpshot ? 'Hide Jumpshot' : 'Show Jumpshot'}
        </button>

        {selectedPlayer && (
          <div className="silhouette-container">
            {showSilhouette && !showActualPortrait && (
              <img
                src={`/images/${selectedPlayer.name.toLowerCase().replace(" ", "")}-headshot.png`}
                alt="Player silhouette"
                className="silhouette"
              />
            )}
            {gameOver && portraitModalDismissed && (
              <img
                src={`/images/${selectedPlayer.name.toLowerCase().replace(" ", "")}-actual.png`}
                alt="Player actual"
                className="actual"
              />
            )}
          </div>
        )}

        {selectedPlayer && showJumpshot && (
          <div className="jumpshot-container">
            {showActualPortrait ? (
              <video
                src={`${process.env.PUBLIC_URL}/images/${selectedPlayer.name.toLowerCase().replace(" ", "")}-jumpshotreveal.mp4`}
                autoPlay
                loop
                muted
                controls
                className="jumpshot"
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <video
                src={`${process.env.PUBLIC_URL}/images/${selectedPlayer.name.toLowerCase().replace(" ", "")}-jumpshot.mp4`}
                autoPlay
                loop
                muted
                controls
                className="jumpshot"
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        )}

        <div className="game-info">
          <h3>Previous Guesses:</h3>
          <div className="info-box">
            <div className="info-box-inner">
              <div className="info-item-wrapper title">
                <div className="info-label">Name</div>
                <div className="info-label">Team</div>
                <div className="info-label">Pos</div>
                <div className="info-label">Conf</div>
                <div className="info-label">Ht</div>
                <div className="info-label">Age</div>
                <div className="info-label">#</div>
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
                  <div className={`info-item ${prevGuess ? getFeedbackClassTeam(prevGuess.feedback.team) : ''}`}>
                    {prevGuess && (
                      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%'}}>
                        <img
                          src={`/logos/${prevGuess.feedback.team ? prevGuess.feedback.team.split(' ')[0].toLowerCase() : ''}.png`}
                          alt=""
                          style={{height: 24, marginBottom: 2, objectFit: 'contain'}}
                        />
                        <span style={{fontSize: '1em', marginTop: 2}}>
                          {prevGuess.feedback.team ? prevGuess.feedback.team.split(' ')[0] : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={`info-item ${prevGuess ? getFeedbackClassSimple(prevGuess.feedback.position) : ''}`}>
                    {prevGuess ? prevGuess.feedback.positionText : ''}
                  </div>
                  <div className={`info-item ${prevGuess ? getFeedbackClassSimple(prevGuess.feedback.conf) : ''}`}>
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

export default App;