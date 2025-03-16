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

// WebSocket setup for HTTP
const wssHttp = new WebSocketServer({ server: httpServer });
setupWebSocketServer(wssHttp);

// WebSocket setup for HTTPS if available
let wssHttps;
if (httpsServer) {
  wssHttps = new WebSocketServer({ server: httpsServer });
  setupWebSocketServer(wssHttps);
}

// Game state
const gameState = {
  currentQuestion: null,
  playerAnswers: {},  // Maps questionId -> { playerId: answer }
  players: {},        // Maps playerId -> { connection, score, name }
  hostConnection: null,
  verifierConnection: null
};

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
      handlePlayerConnection(ws, connectionId);
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
}

// Player connection handler
function handlePlayerConnection(ws, connectionId) {
  // Add player to game state
  gameState.players[connectionId] = {
    connection: ws,
    score: 0,
    name: `Player-${Object.keys(gameState.players).length + 1}`,
    answers: {}
  };
  
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
  
  // Send current game state to new player
  const initialState = {
    type: 'gameState',
    question: gameState.currentQuestion,
    score: 0,
    id: connectionId
  };
  
  ws.send(JSON.stringify(initialState));
  
  // Broadcast updated player list to all
  broadcastPlayerList();
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
    points: message.points
  };
  
  // Reset answers for this question
  gameState.playerAnswers[message.questionId] = {};
  
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
  
  const questionId = gameState.currentQuestion.id;
  
  // Store the player's answer
  if (!gameState.playerAnswers[questionId]) {
    gameState.playerAnswers[questionId] = {};
  }
  
  gameState.playerAnswers[questionId][playerId] = {
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
  
  // Mark the answer as verified
  if (gameState.playerAnswers[questionId][playerId]) {
    gameState.playerAnswers[questionId][playerId].verified = true;
    gameState.playerAnswers[questionId][playerId].correct = correct;
    
    // Update player score if correct
    if (correct && gameState.currentQuestion && gameState.currentQuestion.id === questionId) {
      gameState.players[playerId].score += gameState.currentQuestion.points;
      
      // Notify player their answer was correct
      gameState.players[playerId].connection.send(JSON.stringify({
        type: 'verification',
        correct: true,
        newScore: gameState.players[playerId].score
      }));
    } else {
      // Notify player their answer was incorrect
      gameState.players[playerId].connection.send(JSON.stringify({
        type: 'verification',
        correct: false,
        newScore: gameState.players[playerId].score
      }));
    }
    
    // Broadcast updated scores
    broadcastScores();
  }
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
