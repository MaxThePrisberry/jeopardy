// server.js
console.log("Starting Jeopardy Game Server...");

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

// Express app setup
const app = express();
const port = process.env.PORT || 4000;

// Create HTTP server
const httpServer = http.createServer(app);

// Create HTTPS server if certificates exist
let httpsServer;
try {
  // Check if SSL certificates exist
  if (fs.existsSync('./certificates/key.pem') && fs.existsSync('./certificates/cert.pem')) {
    const sslOptions = {
      key: fs.readFileSync('./certificates/key.pem'),
      cert: fs.readFileSync('./certificates/cert.pem')
    };
    httpsServer = https.createServer(sslOptions, app);
    console.log("HTTPS server created");
  }
} catch (error) {
  console.log("SSL certificates not found, running only HTTP server");
}

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.static('./public'));

// Routes for different interfaces
app.get('/host', (req, res) => {
  res.sendFile('host.html', { root: 'public' });
});

app.get('/verify', (req, res) => {
  res.sendFile('verify.html', { root: 'public' });
});

app.get('/player', (req, res) => {
  res.sendFile('player.html', { root: 'public' });
});

// Return homepage for any other route
app.use((req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// Start the HTTP server
httpServer.listen(port, () => {
  console.log(`Jeopardy Game Server is running on HTTP at http://localhost:${port}`);
});

// Start the HTTPS server if available
if (httpsServer) {
  const httpsPort = process.env.HTTPS_PORT || 4443;
  httpsServer.listen(httpsPort, () => {
    console.log(`Jeopardy Game Server is running on HTTPS at https://localhost:${httpsPort}`);
  });
}

// Game state
const gameState = {
  currentQuestion: null,
  playerAnswers: {},  // Maps questionId -> { points, answers: { playerId: { answer, verified, correct } } }
  players: {},        // Maps playerId -> { connection, score, name, answers }
  hostConnection: null,
  verifierConnection: null
};

// Score update interval
let scoreUpdateInterval = null;

// WebSocket setup for HTTP
const wssHttp = new WebSocketServer({ server: httpServer });
setupWebSocketServer(wssHttp);

// WebSocket setup for HTTPS if available
let wssHttps;
if (httpsServer) {
  wssHttps = new WebSocketServer({ server: httpsServer });
  setupWebSocketServer(wssHttps);
}

// Helper function to parse cookies
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0].trim();
    const value = parts[1] ? parts[1].trim() : '';
    cookies[name] = value;
  });
  
  return cookies;
}

// Set up WebSocket server with connection handlers
function setupWebSocketServer(wss) {
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    // Parse the URL to determine the connection type
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // Generate a unique ID for this connection
    const connectionId = uuidv4();
    
    if (pathname === '/ws/host') {
      handleHostConnection(ws, connectionId);
    } else if (pathname === '/ws/verify') {
      handleVerifierConnection(ws, connectionId);
    } else if (pathname === '/ws/player') {
      handlePlayerConnection(ws, connectionId, req);
    } else {
      console.log(`Unknown WebSocket endpoint: ${pathname}`);
      ws.close();
      return;
    }
    
    // Set up ping/pong to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Handle connection close
    ws.on('close', () => {
      handleConnectionClose(pathname, connectionId);
    });
  });

  // Keep-alive mechanism with ping/pong
  const pingInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });
}

// Host connection handler
function handleHostConnection(ws, connectionId) {
  // Only allow one host connection
  if (gameState.hostConnection) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Another host is already connected'
    }));
    ws.close();
    return;
  }
  
  gameState.hostConnection = { ws, id: connectionId };
  
  // Process messages from the host
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'question':
          // Host has selected a question to display
          handleQuestionSelected(message);
          break;
        
        case 'reset':
          // Reset the game
          resetGame();
          break;
          
        default:
          console.log(`Unknown message type from host: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing host message:', error);
    }
  });
  
  // Confirm connection
  ws.send(JSON.stringify({
    type: 'connected',
    role: 'host'
  }));

  // Send current player list
  broadcastPlayerList();
}

// Verifier connection handler
function handleVerifierConnection(ws, connectionId) {
  // Only allow one verifier connection
  if (gameState.verifierConnection) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Another verifier is already connected'
    }));
    ws.close();
    return;
  }
  
  gameState.verifierConnection = { ws, id: connectionId };
  
  // Process messages from the verifier
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'verification':
          // Verifier has marked an answer as correct or incorrect
          handleAnswerVerification(message);
          break;
          
        default:
          console.log(`Unknown message type from verifier: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing verifier message:', error);
    }
  });
  
  // Confirm connection
  ws.send(JSON.stringify({
    type: 'connected',
    role: 'verifier'
  }));

  // Also send current scores
  broadcastScores();
}

// Player connection handler
function handlePlayerConnection(ws, connectionId, req) {
  // Check for existing player cookie
  const cookies = parseCookies(req.headers.cookie);
  const existingPlayerId = cookies.playerId;
  
  // If we have a player ID cookie and the player exists in our game state
  if (existingPlayerId && gameState.players[existingPlayerId]) {
    // Update the connection and use existing player data
    gameState.players[existingPlayerId].connection = ws;
    connectionId = existingPlayerId;
    console.log(`Player reconnected with ID: ${connectionId}`);
  } else {
    // New player - create new entry
    gameState.players[connectionId] = {
      connection: ws,
      score: 0,
      name: `Player-${Object.keys(gameState.players).length + 1}`,
      answers: {}
    };
    
    // Set a cookie so the player can be identified on reconnection
    ws.send(JSON.stringify({
      type: 'setCookie',
      name: 'playerId',
      value: connectionId,
      maxAge: 86400 // 24 hours
    }));
  }
  
  // Process messages from the player
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'answer':
          // Player has submitted an answer
          handlePlayerAnswer(connectionId, message);
          break;
          
        case 'register':
          // Player has registered with a name
          if (message.name && message.name.trim()) {
            gameState.players[connectionId].name = message.name.trim();
            broadcastPlayerList();
          }
          break;
          
        default:
          console.log(`Unknown message type from player: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing player message:', error);
    }
  });
  
  // Send current game state to player
  const initialState = {
    type: 'gameState',
    question: gameState.currentQuestion,
    score: gameState.players[connectionId].score,
    id: connectionId,
    name: gameState.players[connectionId].name
  };
  
  ws.send(JSON.stringify(initialState));
  
  // Broadcast updated player list to all
  broadcastPlayerList();
  
  // Also send current scores to ensure everyone is in sync
  broadcastScores();
}

// Handle connection closures
function handleConnectionClose(pathname, connectionId) {
  console.log(`WebSocket connection closed on ${pathname} for ID ${connectionId}`);
  
  switch (pathname) {
    case '/ws/host':
      if (gameState.hostConnection && gameState.hostConnection.id === connectionId) {
        gameState.hostConnection = null;
        console.log('Host disconnected');
      }
      break;
      
    case '/ws/verify':
      if (gameState.verifierConnection && gameState.verifierConnection.id === connectionId) {
        gameState.verifierConnection = null;
        console.log('Verifier disconnected');
      }
      break;
      
    case '/ws/player':
      if (gameState.players[connectionId]) {
        delete gameState.players[connectionId];
        console.log('Player disconnected');
        broadcastPlayerList();
      }
      break;
  }
}

// Game logic functions
function handleQuestionSelected(message) {
  // Ensure we have question data
  if (!message.questionId || !message.questionText || !message.points) {
    return;
  }
  
  // Update game state
  gameState.currentQuestion = {
    id: message.questionId,
    text: message.questionText,
    points: parseInt(message.points)
  };
  
  // Reset answers for this question
  gameState.playerAnswers[message.questionId] = {
    points: parseInt(message.points),
    answers: {}
  };
  
  // Broadcast question to all players
  Object.values(gameState.players).forEach(player => {
    player.connection.send(JSON.stringify({
      type: 'question',
      questionId: message.questionId,
      questionText: message.questionText,
      points: message.points
    }));
  });
  
  // Inform verifier that a new question is active
  if (gameState.verifierConnection) {
    gameState.verifierConnection.ws.send(JSON.stringify({
      type: 'questionActive',
      questionId: message.questionId,
      questionText: message.questionText,
      points: message.points
    }));
  }
}

function handlePlayerAnswer(playerId, message) {
  // Ensure we have a current question
  if (!gameState.currentQuestion) {
    return;
  }
  
  // Ensure player is properly registered
  if (!gameState.players[playerId] || 
      !gameState.players[playerId].name || 
      gameState.players[playerId].name.indexOf('Player-') === 0) {
    
    // Send error message to player
    if (gameState.players[playerId] && gameState.players[playerId].connection) {
      gameState.players[playerId].connection.send(JSON.stringify({
        type: 'error',
        message: 'You must enter your name before answering questions'
      }));
    }
    return;
  }
  
  const questionId = gameState.currentQuestion.id;
  
  // Store the player's answer
  if (!gameState.playerAnswers[questionId]) {
    gameState.playerAnswers[questionId] = {
      points: gameState.currentQuestion.points,
      answers: {}
    };
  }
  
  gameState.playerAnswers[questionId].answers[playerId] = {
    answer: message.answer,
    verified: false
  };
  
  // Track answer in player object too
  gameState.players[playerId].answers[questionId] = message.answer;
  
  // Send answer to verifier
  if (gameState.verifierConnection) {
    gameState.verifierConnection.ws.send(JSON.stringify({
      type: 'playerAnswer',
      playerId: playerId,
      playerName: gameState.players[playerId].name,
      questionId: questionId,
      answer: message.answer
    }));
  }
  
  // Notify host of the answer
  if (gameState.hostConnection) {
    gameState.hostConnection.ws.send(JSON.stringify({
      type: 'playerAnswered',
      playerId: playerId,
      playerName: gameState.players[playerId].name
    }));
  }
}

function handleAnswerVerification(message) {
  // Ensure we have required data
  if (!message.playerId || !message.questionId || message.correct === undefined) {
    return;
  }
  
  const { playerId, questionId, correct } = message;
  
  // Ensure the player and question exist
  if (!gameState.players[playerId] || !gameState.playerAnswers[questionId]) {
    return;
  }
  
  // Check if this is a re-verification (answer was already verified)
  const playerAnswer = gameState.playerAnswers[questionId].answers[playerId];
  if (!playerAnswer) {
    return;
  }
  
  const isReVerification = playerAnswer.verified;
  const previousCorrect = isReVerification ? playerAnswer.correct : false;
  
  // Mark the answer as verified
  playerAnswer.verified = true;
  playerAnswer.correct = correct;
  
  // Get the points for this question
  const questionPoints = gameState.playerAnswers[questionId].points;
  
  // If re-verification, we need to adjust the score
  if (isReVerification) {
    // If was correct and now incorrect, subtract points
    if (previousCorrect && !correct) {
      gameState.players[playerId].score -= questionPoints;
    }
    // If was incorrect and now correct, add points
    else if (!previousCorrect && correct) {
      gameState.players[playerId].score += questionPoints;
    }
    // If no change in correctness, do nothing
  } else {
    // First-time verification, add points if correct
    if (correct) {
      gameState.players[playerId].score += questionPoints;
    }
  }
  
  // Notify player of verification result
  gameState.players[playerId].connection.send(JSON.stringify({
    type: 'verification',
    correct: correct,
    newScore: gameState.players[playerId].score
  }));
  
  // Score updates are now handled by the interval, not here
}

function resetGame() {
  // Reset game state
  gameState.currentQuestion = null;
  gameState.playerAnswers = {};
  
  // Reset player scores
  Object.keys(gameState.players).forEach(playerId => {
    gameState.players[playerId].score = 0;
    gameState.players[playerId].answers = {};
  });
  
  // Notify all connections
  broadcastMessage({
    type: 'gameReset'
  });
  
  // Explicitly broadcast updated scores to ensure everyone gets the reset
  broadcastScores();
}

// Utility functions
function broadcastMessage(message) {
  const messageString = JSON.stringify(message);
  
  // Send to host
  if (gameState.hostConnection) {
    gameState.hostConnection.ws.send(messageString);
  }
  
  // Send to verifier
  if (gameState.verifierConnection) {
    gameState.verifierConnection.ws.send(messageString);
  }
  
  // Send to all players
  Object.values(gameState.players).forEach(player => {
    player.connection.send(messageString);
  });
}

function broadcastPlayerList() {
  const playerList = Object.entries(gameState.players).map(([id, player]) => ({
    id,
    name: player.name,
    score: player.score
  }));
  
  const message = {
    type: 'playerList',
    players: playerList
  };
  
  broadcastMessage(message);
}

function broadcastScores() {
  const scores = Object.entries(gameState.players).map(([id, player]) => ({
    id,
    name: player.name,
    score: player.score
  }));
  
  const message = {
    type: 'scores',
    scores: scores.sort((a, b) => b.score - a.score) // Sort by score descending
  };
  
  broadcastMessage(message);
}

// Start the score update interval
function startScoreUpdateInterval() {
  // Clear any existing interval
  if (scoreUpdateInterval) {
    clearInterval(scoreUpdateInterval);
  }
  
  // Set new interval to update scores every 5 seconds
  scoreUpdateInterval = setInterval(() => {
    broadcastScores();
  }, 5000);
}

// Start the score update interval when server starts
startScoreUpdateInterval();

// Ensure the interval gets cleared if the server shuts down
process.on('SIGINT', () => {
  console.log('Shutting down Jeopardy Game Server...');
  if (scoreUpdateInterval) {
    clearInterval(scoreUpdateInterval);
  }
  process.exit(0);
});
