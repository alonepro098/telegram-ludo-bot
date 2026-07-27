// ================= CONSTANTS & COORDINATE MAPS =================
const COLORS = ["Red", "Green", "Yellow", "Blue"];
const START_TRACK_INDICES = { Red: 1, Green: 14, Yellow: 27, Blue: 40 };
const SAFE_CELLS = new Set([1, 9, 14, 22, 27, 35, 40, 48]);

// 52-cell outer track coordinates on 15x15 board (0-indexed)
const TRACK_COORDS = [
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // Left arm top row (L-R)
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // Top arm left row (B-T)
    [0, 7],                                          // Top border
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // Top arm right row (T-B)
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // Right arm top row (L-R)
    [7, 14],                                         // Right border
    [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // Right arm bottom row (R-L)
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // Bottom arm right row (T-B)
    [14, 7],                                         // Bottom border
    [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // Bottom arm left row (B-T)
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // Left arm bottom row (R-L)
    [7, 0]                                           // Left border
];

// 5 Home corridor cells coordinates for each color
const HOME_CORRIDORS = {
    Red:    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    Green:  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    Yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    Blue:   [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

// Home finish coordinates (triangles)
const HOME_CENTERS = {
    Red:    [7, 6],
    Green:  [6, 7],
    Yellow: [7, 8],
    Blue:   [8, 7]
};

// Base pocket coordinates for 4 pawns (0-3) sitting in their bases
const BASE_POCKETS = {
    Red:    [[1, 1], [1, 4], [4, 1], [4, 4]],
    Green:  [[1, 10], [1, 13], [4, 10], [4, 13]],
    Yellow: [[10, 10], [10, 13], [13, 10], [13, 13]],
    Blue:   [[10, 1], [10, 4], [13, 1], [13, 4]]
};

// ================= AUDIO SYNTHESIZER =================
let audioCtx = null;
let soundMuted = false;

function playSound(type) {
    if (soundMuted) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'roll') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);
            osc.frequency.exponentialRampToValueAtTime(250, now + 0.25);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'move') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(380, now);
            osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'capture') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.linearRampToValueAtTime(70, now + 0.35);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'home') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
            osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.45);
        } else if (type === 'win') {
            osc.type = 'square';
            const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                osc.frequency.setValueAtTime(freq, now + idx * 0.07);
            });
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
            osc.start(now);
            osc.stop(now + 0.7);
        }
    } catch (e) {
        console.warn("Audio Context error: ", e);
    }
}

// ================= STATE MANAGEMENT =================
let tg = null;
let gameMode = 'local'; // 'local' or 'multiplayer'
let roomCode = "";
let chatId = "";
let userId = Math.floor(Math.random() * 1000000); // Fallback mock ID
let userName = `Guest_${userId.toString().slice(-4)}`;
let userUsername = "";

// Lobby state
let isHost = false;
let lobbyPlayers = [];

// Game state
let socket = null;
let gameStarted = false;
let currentTurn = "Red"; // Starting color
let myColor = "Red"; // In multiplayer, holds color. In local, holds user color.
let localPlayers = []; // In local play, holds the list of colors: ['Red', 'Green', 'Yellow', 'Blue']
let pawns = { Red: [0,0,0,0], Green: [0,0,0,0], Yellow: [0,0,0,0], Blue: [0,0,0,0] };
let diceValue = 0;
let diceRolled = false;
let validMoves = [];
let standings = []; // Finishing players colors
let consecutiveSixes = 0;

// Initialize Telegram WebApp SDK if available
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    // Load player details from Telegram
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const u = tg.initDataUnsafe.user;
        userId = u.id;
        userName = u.first_name + (u.last_name ? " " + u.last_name : "");
        userUsername = u.username || "";
    }
}

// Set up DOM bindings on load
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("profile-name").innerText = userName;
    document.getElementById("profile-status").innerText = userUsername ? `@${userUsername}` : "Telegram Player";
    
    // Bind buttons
    document.getElementById("btn-create-room").addEventListener("click", createMultiplayerRoom);
    document.getElementById("btn-join-room-trigger").addEventListener("click", () => document.getElementById("join-modal").classList.remove("hidden"));
    document.getElementById("btn-cancel-join").addEventListener("click", () => document.getElementById("join-modal").classList.add("hidden"));
    document.getElementById("btn-confirm-join").addEventListener("click", joinMultiplayerRoom);
    document.getElementById("btn-local-play").addEventListener("click", startLocalGame);
    document.getElementById("btn-copy-code").addEventListener("click", copyRoomCode);
    document.getElementById("btn-invite-friends").addEventListener("click", inviteFriends);
    document.getElementById("btn-start-game").addEventListener("click", triggerStartGame);
    document.getElementById("btn-leave-lobby").addEventListener("click", leaveLobby);
    document.getElementById("btn-game-back").addEventListener("click", quitGameToHome);
    document.getElementById("btn-results-home").addEventListener("click", quitGameToHome);
    document.getElementById("btn-share-results").addEventListener("click", shareResultsToTelegram);
    
    // Mute button toggle
    document.getElementById("btn-mute-toggle").addEventListener("click", () => {
        soundMuted = !soundMuted;
        document.getElementById("btn-mute-toggle").innerText = soundMuted ? "🔇" : "🔊";
        document.getElementById("btn-mute-toggle").classList.toggle("muted", soundMuted);
    });

    // 3D Dice click
    document.getElementById("dice-container").addEventListener("click", rollDiceAction);

    // Build the board grid in HTML
    buildBoardGrid();

    // Check query string parameters (passed by bot deep link or keyboard button)
    checkQueryParams();
});

function checkQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    const chatParam = params.get("chat_id");
    
    // Alternatively, check Telegram WebApp start_param (deep linking)
    let startParam = null;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        startParam = tg.initDataUnsafe.start_param;
    }

    const targetRoom = startParam || roomParam;
    
    if (chatParam) {
        chatId = chatParam;
    }

    if (targetRoom) {
        console.log(`[App] Found room parameter in launch: ${targetRoom}`);
        connectWebSocket(targetRoom);
    }
}

// ================= BOARD INITIALIZATION =================
function buildBoardGrid() {
    const board = document.getElementById("ludo-board");
    board.innerHTML = ""; // Clear
    
    // Create base boxes for Red, Green, Yellow, Blue (15x15 CSS Grid mapping)
    // Red Base: cols 1-6, rows 1-6
    createBaseElement(board, "Red", 1, 7, 1, 7);
    
    // Top-Center Track arm: cols 7-9, rows 1-6 (JavaScript will generate the individual cells)
    // Green Base: cols 10-15, rows 1-6
    createBaseElement(board, "Green", 1, 7, 10, 16);
    
    // Middle track arm (Left/Right) and center home box: cols 7-9, rows 7-9
    // Bottom-Left Base: cols 1-6, rows 10-15
    createBaseElement(board, "Blue", 10, 16, 1, 7);
    
    // Bottom-Center Track arm: cols 7-9, rows 10-15
    // Bottom-Right Base: cols 10-15, rows 10-15
    createBaseElement(board, "Yellow", 10, 16, 10, 16);

    // Center Home box (triangles): cols 7-9, rows 7-9
    const centerHome = document.createElement("div");
    centerHome.className = "center-home";
    centerHome.style.gridColumn = "7 / 10";
    centerHome.style.gridRow = "7 / 10";
    
    // Draw SVG triangles inside center home
    centerHome.innerHTML = `
        <svg viewBox="0 0 100 100" class="center-home-svg">
            <polygon points="0,0 50,50 0,100" fill="var(--color-red)" />
            <polygon points="0,0 50,50 100,0" fill="var(--color-green)" />
            <polygon points="100,0 50,50 100,100" fill="var(--color-yellow)" />
            <polygon points="0,100 50,50 100,100" fill="var(--color-blue)" />
        </svg>
    `;
    board.appendChild(centerHome);

    // Generate individual 1x1 cells for tracks
    // For a 15x15 board, we iterate rows 0 to 14, cols 0 to 14
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            // Skip bases and center home (they are already big boxes spanning grid coords)
            if (r < 6 && c < 6) continue; // Red base
            if (r < 6 && c >= 9) continue; // Green base
            if (r >= 9 && c < 6) continue; // Blue base
            if (r >= 9 && c >= 9) continue; // Yellow base
            if (r >= 6 && r < 9 && c >= 6 && c < 9) continue; // Center home

            const cell = document.createElement("div");
            cell.className = "cell";
            cell.style.gridColumn = `${c + 1}`;
            cell.style.gridRow = `${r + 1}`;
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            // Check cell styles (start points, star safe zones, corridors)
            applyCellTheming(cell, r, c);
            
            board.appendChild(cell);
        }
    }
}

function createBaseElement(board, color, rowStart, rowEnd, colStart, colEnd) {
    const base = document.createElement("div");
    base.className = `base base-${color.toLowerCase()}`;
    base.style.gridColumn = `${colStart} / ${colEnd}`;
    base.style.gridRow = `${rowStart} / ${rowEnd}`;

    const inner = document.createElement("div");
    inner.className = "base-inner";
    
    // 4 pockets for pawns
    for (let i = 0; i < 4; i++) {
        const pocket = document.createElement("div");
        pocket.className = `base-pocket pocket-${color.toLowerCase()}`;
        // Give pocket absolute grid coordinates relative to board so pawns render on top of them
        const pocketCoords = BASE_POCKETS[color][i];
        pocket.dataset.row = pocketCoords[0];
        pocket.dataset.col = pocketCoords[1];
        pocket.id = `pocket-${color}-${i}`;
        inner.appendChild(pocket);
    }
    
    base.appendChild(inner);
    board.appendChild(base);
}

function applyCellTheming(cell, r, c) {
    // Red start: (6, 1), Green start: (1, 8), Yellow start: (8, 13), Blue start: (13, 6)
    if (r === 6 && c === 1) cell.classList.add("red-start");
    else if (r === 1 && c === 8) cell.classList.add("green-start");
    else if (r === 8 && c === 13) cell.classList.add("yellow-start");
    else if (r === 13 && c === 6) cell.classList.add("blue-start");
    
    // Star safe zones: cell 9: (8, 8)? No, map to safe cells
    // Let's compare coordinates to TRACK_COORDS to identify safe zones and add classes
    const index = TRACK_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
    if (index !== -1) {
        if (SAFE_CELLS.has(index)) {
            cell.classList.add("safe-star");
        }
    }

    // Home corridors
    for (const color of COLORS) {
        const corridor = HOME_CORRIDORS[color];
        if (corridor.some(coord => coord[0] === r && coord[1] === c)) {
            cell.classList.add(`${color.toLowerCase()}-path`);
        }
    }
}

// ================= LOCAL PLAY MODE ENGINE (OFFLINE) =================
function startLocalGame() {
    gameMode = 'local';
    myColor = "Red"; // Local player is always Red
    localPlayers = ["Red", "Green", "Yellow", "Blue"];
    lobbyPlayers = [
        { user_id: userId, name: userName, color: "Red", active: true, is_host: true },
        { user_id: 101, name: "AlphaBot 🤖", color: "Green", active: true, is_host: false },
        { user_id: 102, name: "BravoBot 🤖", color: "Yellow", active: true, is_host: false },
        { user_id: 103, name: "CharlieBot 🤖", color: "Blue", active: true, is_host: false }
    ];
    
    gameStarted = true;
    pawns = { Red: [0,0,0,0], Green: [0,0,0,0], Yellow: [0,0,0,0], Blue: [0,0,0,0] };
    currentTurn = "Red";
    diceValue = 0;
    diceRolled = false;
    validMoves = [];
    standings = [];
    consecutiveSixes = 0;

    // UI Updates
    document.getElementById("lobby-view").classList.add("hidden");
    document.getElementById("game-view").classList.remove("hidden");
    
    renderPawns();
    updateGameUI();
}

function localRollDice() {
    if (diceRolled) return;
    
    // Animate dice spin
    const cube = document.getElementById("dice-cube");
    cube.className = "dice rolling";
    playSound('roll');
    
    setTimeout(() => {
        diceValue = Math.floor(Math.random() * 6) + 1;
        diceRolled = true;
        
        // Show correct cube face
        cube.className = `dice show-${diceValue}`;
        
        if (diceValue === 6) {
            consecutiveSixes++;
            if (consecutiveSixes === 3) {
                // 3 sixes = forfeit
                consecutiveSixes = 0;
                diceValue = 0;
                diceRolled = false;
                showToast("3 Consecutive Sixes! Turn forfeited.");
                localPassTurn();
                return;
            }
        } else {
            consecutiveSixes = 0;
        }

        // Calculate moves
        validMoves = getValidMovesForColor(currentTurn, diceValue);
        updateGameUI();
        
        if (validMoves.length === 0) {
            // Auto pass
            setTimeout(() => {
                localPassTurn();
            }, 1500);
        } else {
            // Highlight movable pawns if human turn, or let AI make decision
            if (currentTurn === myColor) {
                highlightValidPawns();
            } else {
                // Robot plays after brief pause
                setTimeout(localAIMove, 1200);
            }
        }
    }, 600);
}

function getValidMovesForColor(color, roll) {
    const list = [];
    const positions = pawns[color];
    for (let i = 0; i < 4; i++) {
        const steps = positions[i];
        if (steps === 0) {
            if (roll === 6) list.push(i);
        } else if (steps === 57) {
            continue;
        } else if (steps + roll <= 57) {
            list.push(i);
        }
    }
    return list;
}

function highlightValidPawns() {
    validMoves.forEach(idx => {
        const pawnEl = document.getElementById(`pawn-${currentTurn}-${idx}`);
        if (pawnEl) {
            pawnEl.classList.add("valid-move");
            // Set tap listener
            pawnEl.onclick = () => localMovePawnAction(idx);
        }
    });
}

function clearPawnHighlights() {
    COLORS.forEach(color => {
        for (let i = 0; i < 4; i++) {
            const pawnEl = document.getElementById(`pawn-${color}-${i}`);
            if (pawnEl) {
                pawnEl.classList.remove("valid-move");
                pawnEl.onclick = null;
            }
        }
    });
}

async function localMovePawnAction(pawnIdx) {
    if (currentTurn !== myColor || !diceRolled || !validMoves.includes(pawnIdx)) return;
    
    clearPawnHighlights();
    await animatePawnMovement(currentTurn, pawnIdx, diceValue);
    
    // Update state
    const oldSteps = pawns[currentTurn][pawnIdx];
    const newSteps = oldSteps === 0 ? 1 : oldSteps + diceValue;
    pawns[currentTurn][pawnIdx] = newSteps;
    
    let pawnFinished = (newSteps === 57);
    if (pawnFinished) {
        playSound('home');
        // Check if finished game
        if (pawns[currentTurn].every(s => s === 57)) {
            if (!standings.includes(currentTurn)) standings.push(currentTurn);
        }
    }
    
    // Check capture
    let captured = null;
    if (newSteps >= 1 && newSteps <= 51) {
        const targetCell = getTrackCell(currentTurn, newSteps);
        if (!SAFE_CELLS.has(targetCell)) {
            // Check opponent pawns on same target cell
            for (const oppColor of COLORS) {
                if (oppColor === currentTurn) continue;
                const oppPawns = pawns[oppColor];
                for (let i = 0; i < 4; i++) {
                    const oppSteps = oppPawns[i];
                    if (oppSteps >= 1 && oppSteps <= 51) {
                        if (getTrackCell(oppColor, oppSteps) === targetCell) {
                            // Capture!
                            pawns[oppColor][i] = 0;
                            captured = { color: oppColor, idx: i };
                            playSound('capture');
                            showToast(`Captured ${oppColor}'s pawn!`);
                            break;
                        }
                    }
                }
                if (captured) break;
            }
        }
    }
    
    // Check if player gets another turn
    const anotherTurn = (diceValue === 6 && consecutiveSixes < 3) || (captured !== null) || pawnFinished;
    
    // Reset dice
    diceValue = 0;
    diceRolled = false;
    
    if (standings.includes(currentTurn)) {
        // Finished players cannot take another roll
        localPassTurn();
    } else if (anotherTurn) {
        consecutiveSixes = 0;
        updateGameUI();
    } else {
        consecutiveSixes = 0;
        localPassTurn();
    }
}

function localPassTurn() {
    clearPawnHighlights();
    
    // Check game over
    const playable = localPlayers.filter(c => !standings.includes(c));
    if (playable.length <= 1) {
        // Complete standings in order of remaining distance
        const remaining = playable.sort((a, b) => {
            const sumA = pawns[a].reduce((s, val) => s + val, 0);
            const sumB = pawns[b].reduce((s, val) => s + val, 0);
            return sumB - sumA;
        });
        remaining.forEach(c => {
            if (!standings.includes(c)) standings.push(c);
        });
        
        triggerGameOver();
        return;
    }

    // Next player clockwise
    let idx = localPlayers.indexOf(currentTurn);
    do {
        idx = (idx + 1) % localPlayers.length;
        currentTurn = localPlayers[idx];
    } while (standings.includes(currentTurn));

    diceValue = 0;
    diceRolled = false;
    consecutiveSixes = 0;
    validMoves = [];
    
    updateGameUI();
    
    // If next player is AI, trigger roll
    if (currentTurn !== myColor) {
        setTimeout(localAIRoll, 1200);
    }
}

function localAIRoll() {
    if (currentTurn === myColor || !gameStarted) return;
    localRollDice();
}

async function localAIMove() {
    if (currentTurn === myColor || !diceRolled || validMoves.length === 0) return;
    
    // AI decision logic:
    // 1. Capture if possible
    // 2. Go home if possible
    // 3. Release from base if possible
    // 4. Move furthest pawn
    let chosenIdx = validMoves[0];
    let bestScore = -100;
    
    for (const idx of validMoves) {
        const steps = pawns[currentTurn][idx];
        let score = steps; // base score is progress
        
        if (steps === 0) score += 50; // release
        
        const newSteps = steps + diceValue;
        if (newSteps === 57) score += 100; // finish
        
        // Capture check
        if (newSteps >= 1 && newSteps <= 51) {
            const targetCell = getTrackCell(currentTurn, newSteps);
            if (!SAFE_CELLS.has(targetCell)) {
                for (const oppCol of COLORS) {
                    if (oppCol === currentTurn) continue;
                    pawns[oppCol].forEach(os => {
                        if (os >= 1 && os <= 51 && getTrackCell(oppCol, os) === targetCell) {
                            score += 200; // Capture priority
                        }
                    });
                }
            }
        }
        
        if (score > bestScore) {
            bestScore = score;
            chosenIdx = idx;
        }
    }
    
    // Perform move
    await animatePawnMovement(currentTurn, chosenIdx, diceValue);
    
    const oldSteps = pawns[currentTurn][chosenIdx];
    const newSteps = oldSteps === 0 ? 1 : oldSteps + diceValue;
    pawns[currentTurn][chosenIdx] = newSteps;
    
    let pawnFinished = (newSteps === 57);
    if (pawnFinished) {
        playSound('home');
        if (pawns[currentTurn].every(s => s === 57)) {
            if (!standings.includes(currentTurn)) standings.push(currentTurn);
        }
    }
    
    // Check capture
    let captured = null;
    if (newSteps >= 1 && newSteps <= 51) {
        const targetCell = getTrackCell(currentTurn, newSteps);
        if (!SAFE_CELLS.has(targetCell)) {
            for (const oppColor of COLORS) {
                if (oppColor === currentTurn) continue;
                const oppPawns = pawns[oppColor];
                for (let i = 0; i < 4; i++) {
                    const oppSteps = oppPawns[i];
                    if (oppSteps >= 1 && oppSteps <= 51 && getTrackCell(oppColor, oppSteps) === targetCell) {
                        pawns[oppColor][i] = 0;
                        captured = { color: oppColor, idx: i };
                        playSound('capture');
                        showToast(`${currentTurn} (Bot) captured ${oppColor}!`);
                        break;
                    }
                }
                if (captured) break;
            }
        }
    }
    
    const anotherTurn = (diceValue === 6 && consecutiveSixes < 3) || (captured !== null) || pawnFinished;
    
    diceValue = 0;
    diceRolled = false;
    
    if (standings.includes(currentTurn)) {
        localPassTurn();
    } else if (anotherTurn) {
        consecutiveSixes = 0;
        updateGameUI();
        setTimeout(localAIRoll, 1200);
    } else {
        consecutiveSixes = 0;
        localPassTurn();
    }
}

// Translate step (1-51) to track index
function getTrackCell(color, steps) {
    const start = START_TRACK_INDICES[color];
    return (start + steps - 1) % 52;
}

// ================= MULTIPLAYER MODE CLIENT (WEBSOCKET) =================
function createMultiplayerRoom() {
    gameMode = 'multiplayer';
    // Connect to backend via WebSocket
    // Generates a room token on connection handshake
    // The backend main.py creates rooms via REST APIs, or we can connect directly
    // and let the backend assign us a newly generated room if we pass command CREATE.
    // Let's call the FastAPI room creator endpoint
    fetch("/api/room/create", { method: "POST" }) // fallback mock, or let socket handle creation
        .then(res => res.json())
        .then(data => {
            roomCode = data.room_id;
            connectWebSocket(roomCode);
        })
        .catch(() => {
            // Fallback WebSocket handshake creation:
            // Connect to /ws and send room token 'CREATE'
            connectWebSocket("CREATE");
        });
}

function joinMultiplayerRoom() {
    const code = document.getElementById("room-code-input").value.trim();
    if (code.length !== 6) {
        showToast("Enter a valid 6-digit room code.");
        return;
    }
    document.getElementById("join-modal").classList.add("hidden");
    gameMode = 'multiplayer';
    connectWebSocket(code);
}

function connectWebSocket(room) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "localhost:8000";
    const wsUrl = `${protocol}//${host}/ws`;
    
    console.log(`[Socket] Connecting to ${wsUrl}...`);
    showToast("Connecting to server...");
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log("[Socket] Opened successfully.");
        
        // If room is "CREATE", the backend handles creation and returns the new room_id.
        // Usually we fetch details first, or socket handles it.
        // Let's join the specified lobby
        const payload = {
            type: "join_lobby",
            room_id: room === "CREATE" ? "CREATE" : room,
            user_id: userId,
            name: userName,
            username: userUsername
        };
        socket.send(JSON.stringify(payload));
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    socket.onerror = (err) => {
        console.error("[Socket] Error: ", err);
        showToast("Server connection error.");
    };
    
    socket.onclose = () => {
        console.log("[Socket] Closed.");
        showToast("Disconnected from server.");
        if (gameStarted && !standings.includes(myColor)) {
            // Attempt reconnect in 3s
            setTimeout(() => connectWebSocket(roomCode), 3000);
        }
    };
}

function handleServerMessage(data) {
    console.log("[Socket] Received message: ", data);
    
    if (data.type === "error") {
        showToast(data.message);
        quitGameToHome();
        return;
    }
    
    if (data.type === "lobby_update") {
        const room = data.room_state;
        roomCode = room.room_id;
        chatId = room.chat_id || chatId;
        lobbyPlayers = room.players;
        
        // Find if user is host
        const me = lobbyPlayers.find(p => p.user_id === userId);
        if (me) {
            isHost = me.is_host;
            myColor = me.color;
        }

        // Show lobby waiting UI
        document.getElementById("lobby-view").classList.remove("hidden");
        document.getElementById("menu-options").classList.add("hidden");
        document.getElementById("room-lobby").classList.remove("hidden");
        document.getElementById("lobby-code-val").innerText = roomCode;
        
        // Render lobby players
        document.getElementById("player-count").innerText = lobbyPlayers.length;
        
        for (let i = 0; i < 4; i++) {
            const slot = document.getElementById(`slot-${i}`);
            slot.innerHTML = "";
            slot.className = "player-slot empty";
            
            if (i < lobbyPlayers.length) {
                const p = lobbyPlayers[i];
                slot.className = "player-slot occupied";
                
                const dotColor = p.color ? p.color.toLowerCase() : "gray";
                const isMeLabel = p.user_id === userId ? " (You)" : "";
                const hostBadge = p.is_host ? ' <span class="host-badge">HOST</span>' : '';
                const activeState = p.active ? "" : ' <span style="font-size:0.75rem; color:#ff4d4d;">(Offline)</span>';
                
                slot.innerHTML = `
                    <div class="player-slot-name">
                        <span class="color-dot color-${dotColor}"></span>
                        <span>${p.name}${isMeLabel}${hostBadge}${activeState}</span>
                    </div>
                    <span class="ready-dot"></span>
                `;
            } else {
                slot.innerHTML = `<span class="slot-status">Waiting for Player...</span>`;
            }
        }
        
        // Start match button controls
        const startBtn = document.getElementById("btn-start-game");
        if (isHost && lobbyPlayers.length >= 2) {
            startBtn.removeAttribute("disabled");
        } else {
            startBtn.setAttribute("disabled", "true");
        }
    }
    
    else if (data.type === "game_start") {
        gameStarted = true;
        const gState = data.game_state;
        
        // Sync states
        pawns = gState.pawns;
        currentTurn = gState.current_player;
        diceValue = gState.dice_value;
        diceRolled = gState.dice_rolled;
        standings = gState.standings;
        
        // Assign local colors
        const me = lobbyPlayers.find(p => p.user_id === userId);
        if (me) {
            myColor = me.color;
        }
        
        // Transition view
        document.getElementById("lobby-view").classList.add("hidden");
        document.getElementById("game-view").classList.remove("hidden");
        
        renderPawns();
        updateGameUI();
        showToast("Match Started!");
    }
    
    else if (data.type === "game_update") {
        const event = data.event;
        const gState = data.game_state;
        
        // Update states
        pawns = gState.pawns;
        currentTurn = gState.current_player;
        diceValue = gState.dice_value;
        diceRolled = gState.dice_rolled;
        standings = gState.standings;
        validMoves = data.valid_moves || [];
        
        if (event === "dice_rolled") {
            const roller = data.player;
            const rolledVal = data.roll;
            
            // Animate roll
            const cube = document.getElementById("dice-cube");
            cube.className = "dice rolling";
            playSound('roll');
            
            setTimeout(() => {
                cube.className = `dice show-${rolledVal}`;
                updateGameUI();
                
                // Highlight moves if turn matches this client
                if (currentTurn === myColor && validMoves.length > 0) {
                    highlightValidPawns();
                }
            }, 600);
        }
        
        else if (event === "pawn_moved") {
            const mover = data.player;
            const idx = data.pawn_idx;
            const oldSteps = data.old_steps;
            const newSteps = data.new_steps;
            const isCapt = data.captured;
            
            clearPawnHighlights();
            
            // Run movements
            // Since states were already synced, temporarily rollback positions for animation
            pawns[mover][idx] = oldSteps;
            animatePawnMovement(mover, idx, data.roll).then(() => {
                pawns = gState.pawns; // restore synced positions
                
                if (isCapt) {
                    playSound('capture');
                    showToast(`${mover} captured ${isCapt.color}'s pawn!`);
                }
                
                if (data.pawn_finished) {
                    playSound('home');
                }
                
                renderPawns();
                updateGameUI();
                
                // Highlight moves if next turn is this client and dice is already rolled (rare)
                if (currentTurn === myColor && diceRolled && validMoves.length > 0) {
                    highlightValidPawns();
                }
            });
        }
        
        else if (event === "turn_passed") {
            clearPawnHighlights();
            updateGameUI();
        }
    }
    
    else if (data.type === "game_over") {
        // Standings includes name list from server
        // Trigger results
        triggerGameOver(data.standings);
    }
}

function triggerStartGame() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "start_game" }));
    }
}

function rollDiceAction() {
    if (!gameStarted || diceRolled) return;
    
    if (gameMode === 'local') {
        if (currentTurn === myColor) {
            localRollDice();
        }
    } else {
        if (currentTurn === myColor && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "roll_dice" }));
        }
    }
}

function sendMultiplayerMove(pawnIdx) {
    if (gameMode === 'multiplayer' && socket && socket.readyState === WebSocket.OPEN) {
        clearPawnHighlights();
        socket.send(JSON.stringify({
            type: "move_pawn",
            pawn_idx: pawnIdx
        }));
    }
}

// ================= CORE GAME DRAWING & ANIMATIONS =================
function renderPawns() {
    // Clean all cell pawn containers
    document.querySelectorAll(".pawn-container").forEach(el => el.remove());
    document.querySelectorAll(".pawn").forEach(el => el.remove());
    
    // Group pawns by their current coordinates to check overlapping pawns
    const coordsMap = {};
    
    COLORS.forEach(color => {
        const positions = pawns[color] || [];
        for (let i = 0; i < 4; i++) {
            const steps = positions[i];
            let row = null;
            let col = null;
            
            if (steps === 0) {
                // Base pocket positions
                const pocketCoords = BASE_POCKETS[color][i];
                row = pocketCoords[0];
                col = pocketCoords[1];
            } else if (steps >= 1 && steps <= 51) {
                // Outer track coordinates
                const trackIdx = getTrackCell(color, steps);
                const coord = TRACK_COORDS[trackIdx];
                row = coord[0];
                col = coord[1];
            } else if (steps >= 52 && steps <= 56) {
                // Corridor coordinates
                const coord = HOME_CORRIDORS[color][steps - 52];
                row = coord[0];
                col = coord[1];
            } else if (steps === 57) {
                // Center home finish
                const coord = HOME_CENTERS[color];
                row = coord[0];
                col = coord[1];
            }
            
            if (row !== null && col !== null) {
                const key = `${row}_${col}`;
                if (!coordsMap[key]) coordsMap[key] = [];
                coordsMap[key].push({ color, idx: i });
            }
        }
    });

    // Draw pawns on board
    Object.keys(coordsMap).forEach(key => {
        const [r, c] = key.split("_").map(Number);
        const list = coordsMap[key];
        
        // Find corresponding cell or pocket container
        let targetCell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
        
        // If not found in cells, look inside base pocket
        if (!targetCell) {
            // Look for pockets
            targetCell = document.querySelector(`.base-pocket[data-row="${r}"][data-col="${c}"]`);
        }
        
        // Fallback to center home areas
        if (!targetCell) {
            targetCell = document.querySelector(".center-home");
        }
        
        if (targetCell) {
            // Create container for scaling multiple pawns
            const container = document.createElement("div");
            container.className = "pawn-container";
            if (list.length === 2) container.classList.add("stack-2");
            else if (list.length === 3) container.classList.add("stack-3");
            else if (list.length >= 4) container.classList.add("stack-4");
            
            list.forEach(item => {
                const p = document.createElement("div");
                p.className = `pawn pawn-${item.color.toLowerCase()}`;
                p.id = `pawn-${item.color}-${item.idx}`;
                p.dataset.color = item.color;
                p.dataset.idx = item.idx;
                
                // Clicking is only enabled if highlights match (controlled in highlighters)
                container.appendChild(p);
            });
            
            targetCell.appendChild(container);
        }
    });
}

function animatePawnMovement(color, pawnIdx, stepsCount) {
    return new Promise(async (resolve) => {
        const startSteps = pawns[color][pawnIdx];
        
        // If pawn is releasing from base
        if (startSteps === 0) {
            playSound('move');
            pawns[color][pawnIdx] = 1;
            renderPawns();
            resolve();
            return;
        }

        // Animate cell-by-cell moves
        let currentSteps = startSteps;
        for (let s = 1; s <= stepsCount; s++) {
            currentSteps++;
            pawns[color][pawnIdx] = currentSteps;
            playSound('move');
            renderPawns();
            
            // Highlight moving pawn
            const pawnEl = document.getElementById(`pawn-${color}-${pawnIdx}`);
            if (pawnEl) pawnEl.style.transform = "scale(1.2)";
            
            await sleep(150); // Frame rate
        }
        
        resolve();
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ================= UI STATE UPDATERS =================
function updateGameUI() {
    // Current turn text and dot
    const turnIndicator = document.getElementById("turn-color-indicator");
    turnIndicator.className = `color-dot color-${currentTurn.toLowerCase()}`;
    
    // Check if it's user's turn
    const isMyTurn = (currentTurn === myColor);
    
    if (gameMode === 'local') {
        const name = lobbyPlayers.find(p => p.color === currentTurn)?.name || currentTurn;
        document.getElementById("turn-text-val").innerText = isMyTurn ? "Your Turn!" : `${name}'s Turn`;
    } else {
        const name = lobbyPlayers.find(p => p.color === currentTurn)?.name || currentTurn;
        document.getElementById("turn-text-val").innerText = isMyTurn ? "Your Turn!" : `${name}'s Turn`;
    }

    // Dice hints & button states
    const diceContainer = document.getElementById("dice-container");
    const instructions = document.getElementById("dice-instructions");
    
    if (isMyTurn && !diceRolled) {
        diceContainer.classList.remove("disabled");
        instructions.innerText = "Tap Dice to Roll!";
        instructions.style.color = "var(--color-yellow)";
    } else {
        diceContainer.classList.add("disabled");
        if (diceRolled) {
            instructions.innerText = `Rolled a ${diceValue}!`;
            instructions.style.color = "var(--text-primary)";
        } else {
            instructions.innerText = `Waiting for ${currentTurn}...`;
            instructions.style.color = "var(--text-secondary)";
        }
    }

    // Update bottom stats cards
    const statsContainer = document.getElementById("game-players-list");
    statsContainer.innerHTML = "";
    
    lobbyPlayers.forEach(p => {
        if (!p.color) return;
        
        const activeClass = (p.color === currentTurn) ? "active-glow" : "";
        const indicator = p.color ? `<span class="color-dot color-${p.color.toLowerCase()}"></span>` : "";
        
        // Count pawns at home (57) vs base (0) vs board
        const pPositions = pawns[p.color] || [0,0,0,0];
        const baseCount = pPositions.filter(s => s === 0).length;
        const boardCount = pPositions.filter(s => s >= 1 && s <= 56).length;
        const finishedCount = pPositions.filter(s => s === 57).length;
        
        const row = document.createElement("div");
        row.className = `turn-stat-row ${activeClass}`;
        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                ${indicator}
                <span style="font-weight:${p.color === currentTurn ? '800':'400'}">${p.name}</span>
            </div>
            <div class="stat-pawn-count">
                🏠<span>${baseCount}</span> | 🏁<span>${finishedCount}</span>
            </div>
        `;
        statsContainer.appendChild(row);
    });

    // In multiplayer: if not my turn, bind moves to websockets
    if (gameMode === 'multiplayer' && isMyTurn && diceRolled && validMoves.length > 0) {
        validMoves.forEach(idx => {
            const pawnEl = document.getElementById(`pawn-${myColor}-${idx}`);
            if (pawnEl) {
                pawnEl.classList.add("valid-move");
                pawnEl.onclick = () => sendMultiplayerMove(idx);
            }
        });
    }
}

// ================= GAME OVER CERTIFICATE GENERATOR =================
function triggerGameOver(remoteStandings = null) {
    gameStarted = false;
    document.getElementById("game-view").classList.add("hidden");
    document.getElementById("game-over-view").classList.remove("hidden");
    
    playSound('win');

    // Standings container list
    const container = document.getElementById("standings-container");
    container.innerHTML = "";
    
    let standingsList = [];
    
    if (remoteStandings) {
        standingsList = remoteStandings;
    } else {
        // Map local standings
        standings.forEach(color => {
            const p = lobbyPlayers.find(pl => pl.color === color);
            if (p) standingsList.push(p);
        });
    }

    const medals = ["🥇 1st Place", "🥈 2nd Place", "🥉 3rd Place", "🎖️ 4th Place"];
    
    standingsList.forEach((p, idx) => {
        const medalText = medals[idx] || "🎖️ Finished";
        const dotColor = p.color.toLowerCase();
        
        const row = document.createElement("div");
        row.className = `standing-row rank-${idx + 1}`;
        row.innerHTML = `
            <div class="player-info">
                <span class="color-dot color-${dotColor}"></span>
                <span>${p.name}</span>
            </div>
            <span class="standing-medal">${medalText}</span>
        `;
        container.appendChild(row);
    });

    // Draw the beautiful Ludo certificate image on canvas
    generateResultsCertificate(standingsList);
}

function generateResultsCertificate(standingsList) {
    const canvas = document.getElementById("results-canvas");
    const ctx = canvas.getContext("2d");
    document.getElementById("result-canvas-container").classList.remove("hidden");

    // 1. Draw rich background gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, "#0f0f23");
    grad.addColorStop(1, "#17173a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw border lines
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#ffb900"; // Gold border
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    // 3. Draw heading
    ctx.font = "bold 26px 'Outfit', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("LUDO ROYALE CHAMPIONS", canvas.width / 2, 50);

    ctx.font = "14px 'Outfit', sans-serif";
    ctx.fillStyle = "#ffb900";
    ctx.fillText("OFFICIAL MATCH STANDINGS REPORT", canvas.width / 2, 75);

    // 4. Draw Divider Line
    ctx.beginPath();
    ctx.moveTo(100, 95);
    ctx.lineTo(canvas.width - 100, 95);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.stroke();

    // 5. Draw Standings row by row
    const medals = ["🥇 1ST", "🥈 2ND", "🥉 3RD", "🎖️ 4TH"];
    const colorsGradients = {
        Red:    ["#ff4d6d", "#ff2a4b"],
        Green:  ["#2ec4b6", "#209f8f"],
        Yellow: ["#ffb703", "#e89600"],
        Blue:   ["#0077b6", "#005f9e"]
    };

    standingsList.forEach((player, idx) => {
        const yOffset = 130 + idx * 60;
        
        // Draw glass-like card background for each rank
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fillRect(40, yOffset - 25, canvas.width - 80, 46);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.strokeRect(40, yOffset - 25, canvas.width - 80, 46);

        // Draw Player medal
        ctx.font = "bold 16px 'Outfit', sans-serif";
        ctx.fillStyle = idx === 0 ? "#ffb900" : "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(medals[idx] || "FINISH", 60, yOffset + 4);

        // Draw color circle
        const circleGrad = ctx.createRadialGradient(200, yOffset, 2, 200, yOffset, 8);
        const colGrad = colorsGradients[player.color] || ["#ffffff", "#cccccc"];
        circleGrad.addColorStop(0, colGrad[0]);
        circleGrad.addColorStop(1, colGrad[1]);
        ctx.beginPath();
        ctx.arc(200, yOffset, 8, 0, Math.PI * 2);
        ctx.fillStyle = circleGrad;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        // Draw player Name
        ctx.font = "bold 16px 'Outfit', sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(player.name.substring(0, 20), 225, yOffset + 4);

        // Draw Color Badge Text
        ctx.font = "italic 13px 'Outfit', sans-serif";
        ctx.fillStyle = colGrad[0];
        ctx.textAlign = "right";
        ctx.fillText(player.color, canvas.width - 60, yOffset + 4);
    });

    // 6. Draw Footer stamp
    ctx.font = "10px 'Outfit', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "center";
    ctx.fillText("Generated in Telegram Mini App. Room Ref: " + roomCode, canvas.width / 2, canvas.height - 30);
}

// Post results back to Telegram Group Chat
function shareResultsToTelegram() {
    if (!chatId) {
        showToast("No active Telegram group linked. Play in a group!");
        return;
    }

    const canvas = document.getElementById("results-canvas");
    const base64Img = canvas.toDataURL("image/png");

    showToast("Sharing standings to group...");
    
    // Map standings formatted for API
    const mappedStandings = [];
    const container = document.getElementById("standings-container");
    // Retrieve lobby players in their correct finished standings order
    // In multiplayer, lobbyPlayers list holds their names, usernames, and final colors
    const resultsRows = document.querySelectorAll(".standing-row");
    resultsRows.forEach((row, rank) => {
        const name = row.querySelector(".player-info span:nth-child(2)").innerText;
        const colorDot = row.querySelector(".player-info span:nth-child(1)");
        let color = "Red";
        if (colorDot.classList.contains("color-green")) color = "Green";
        else if (colorDot.classList.contains("color-yellow")) color = "Yellow";
        else if (colorDot.classList.contains("color-blue")) color = "Blue";
        
        // Find user details if matches lobby
        const originalPlayer = lobbyPlayers.find(p => p.name === name || (p.color === color && p.name.includes("Bot")));
        
        mappedStandings.push({
            user_id: originalPlayer ? originalPlayer.user_id : 9999,
            name: name,
            username: originalPlayer ? originalPlayer.username : "",
            color: color
        });
    });

    const payload = {
        chat_id: chatId,
        room_id: roomCode,
        image_base64: base64Img,
        standings: mappedStandings
    };

    fetch("/api/share-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast("Results sent to group chat!");
        // Webapp send data can close webapp if needed
        if (tg) {
            setTimeout(() => tg.close(), 1500);
        }
    })
    .catch(err => {
        console.error("[Share] Error posting results: ", err);
        showToast("Failed to share. Bot offline?");
    });
}

// ================= LOBBY & NAVIGATION HELPERS =================
function copyRoomCode() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode)
        .then(() => showToast("Room code copied to clipboard!"))
        .catch(() => showToast("Failed to copy code."));
}

function inviteFriends() {
    if (!roomCode) return;
    if (tg) {
        // Build share link: https://t.me/botusername/appname?startapp=ROOM_CODE
        const botUsername = "ludo_game_bot"; // Bot username fallback
        const inviteLink = `https://t.me/${botUsername}/app?startapp=${roomCode}`;
        const inviteText = `Join my Ludo Royale match! Room Code: ${roomCode}`;
        
        // Open Telegram share dialog
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(inviteText)}`);
    } else {
        const text = `Join my room: ${roomCode}`;
        navigator.clipboard.writeText(text);
        showToast("Invite copied to clipboard!");
    }
}

function leaveLobby() {
    quitGameToHome();
}

function quitGameToHome() {
    // Close WebSocket
    if (socket) {
        socket.close();
        socket = null;
    }
    
    gameStarted = false;
    roomCode = "";
    isHost = false;
    lobbyPlayers = [];
    standings = [];
    clearPawnHighlights();

    // Reset view visibility
    document.getElementById("room-lobby").classList.add("hidden");
    document.getElementById("menu-options").classList.remove("hidden");
    document.getElementById("game-view").classList.add("hidden");
    document.getElementById("game-over-view").classList.add("hidden");
    document.getElementById("lobby-view").classList.remove("hidden");
    
    // Clean URL query parameters
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Simple Toast banner alert helper
function showToast(message) {
    if (tg && tg.showNotification) {
        // If Telegram notifications are supported (on select versions)
        try {
            tg.showNotification(message);
            return;
        } catch(e){}
    }
    
    // HTML Custom toast fallback
    let toast = document.getElementById("toast-banner");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-banner";
        toast.style.position = "fixed";
        toast.style.bottom = "30px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";
        toast.style.background = "rgba(0, 0, 0, 0.85)";
        toast.style.color = "#fff";
        toast.style.padding = "10px 20px";
        toast.style.borderRadius = "20px";
        toast.style.fontSize = "0.9rem";
        toast.style.fontWeight = "600";
        toast.style.zIndex = "1000";
        toast.style.backdropFilter = "blur(8px)";
        toast.style.border = "1px solid rgba(255,255,255,0.1)";
        toast.style.pointerEvents = "none";
        toast.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
        toast.style.textAlign = "center";
        toast.style.whiteSpace = "nowrap";
        toast.style.animation = "fadeIn 0.3s ease-out";
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.display = "block";
    
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.style.display = "none";
    }, 2500);
}
