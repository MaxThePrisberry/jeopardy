// Helper function to set cookies
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const registrationEl = document.getElementById('registration');
    const playerStatusEl = document.getElementById('player-status');
    const playerNameInput = document.getElementById('player-name');
    const registerButton = document.getElementById('register-button');
    const playerScoreEl = document.getElementById('player-score');
    const playerNameDisplayEl = document.getElementById('player-name-display');
    const statusMessageEl = document.getElementById('status-message');
    const currentQuestionEl = document.getElementById('current-question');
    const questionPointsEl = document.getElementById('question-points');
    const answerFormEl = document.getElementById('answer-form');
    const answerInput = document.getElementById('answer-input');
    const submitAnswerButton = document.getElementById('submit-answer');
    const leaderboardListEl = document.getElementById('leaderboard-list');
    
    // Game state
    let playerId = null;
    let playerName = '';
    let currentQuestion = null;
    let score = 0;
    let hasAnsweredCurrentQuestion = false;
    
    // WebSocket connection
    let socket;
    
    function initializeWebSocket() {
        // Simple protocol detection
        const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss';
        socket = new WebSocket(`${protocol}://${window.location.host}/ws/player`);
        
        socket.onopen = () => {
            console.log('Connected to server as player');
        };
        
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connected':
                    console.log(`Connected as ${message.role}`);
                    break;
                
                case 'setCookie':
                    setCookie(message.name, message.value, message.maxAge / 86400);
                    break;
                    
                case 'gameState':
                    playerId = message.id;
                    updateScore(message.score);
                    
                    // If the player already has a name, update UI accordingly
                    if (message.name && message.name.indexOf('Player-') !== 0) {
                        playerName = message.name;
                        playerNameDisplayEl.textContent = playerName;
                        // Hide registration and show player status
                        registrationEl.classList.add('hidden');
                        playerStatusEl.classList.remove('hidden');
                        statusMessageEl.textContent = `Welcome back, ${playerName}!`;
                        
                        // Update player name input just in case
                        playerNameInput.value = playerName;
                    }
                    
                    if (message.question) {
                        setCurrentQuestion(message.question);
                    }
                    break;
                    
                case 'question':
                    setCurrentQuestion(message);
                    break;
                    
                case 'verification':
                    handleVerification(message);
                    break;
                    
                case 'scores':
                    updateLeaderboard(message.scores);
                    break;
                    
                case 'gameReset':
                    resetPlayer();
                    break;
                    
                case 'error':
                    alert(`Error: ${message.message}`);
                    break;
            }
        };
        
        socket.onclose = () => {
            console.log('Connection closed');
            setTimeout(initializeWebSocket, 5000); // Reconnect after 5 seconds
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    function registerPlayer() {
        playerName = playerNameInput.value.trim();
        
        if (!playerName) {
            alert('Please enter your name');
            return;
        }
        
        // Send registration to server
        socket.send(JSON.stringify({
            type: 'register',
            name: playerName
        }));
        
        // Update UI
        registrationEl.classList.add('hidden');
        playerStatusEl.classList.remove('hidden');
        statusMessageEl.textContent = `Welcome, ${playerName}!`;
        playerNameDisplayEl.textContent = playerName; // Update the displayed name
    }
    
    function setCurrentQuestion(question) {
        currentQuestion = question;
        currentQuestionEl.textContent = question.questionText;
        questionPointsEl.textContent = `${question.points} points`;
        
        // Reset answer state
        hasAnsweredCurrentQuestion = false;
        answerInput.value = '';
        
        // Only show answer form if player is registered
        if (playerName && playerName !== '' && playerName.indexOf('Player-') !== 0) {
            answerFormEl.classList.remove('hidden');
            // Focus the answer input
            answerInput.focus();
        } else {
            // Show message to register first
            answerFormEl.classList.add('hidden');
            statusMessageEl.textContent = 'Please enter your name and join the game to answer questions.';
        }
    }
    
    function submitAnswer() {
        if (!currentQuestion || hasAnsweredCurrentQuestion) {
            return;
        }
        
        // Check if player is registered with a name
        if (!playerName || playerName === '' || playerName.indexOf('Player-') === 0) {
            alert('Please enter your name and join the game before answering.');
            return;
        }
        
        const answer = answerInput.value.trim();
        
        if (!answer) {
            alert('Please enter an answer');
            return;
        }
        
        // Send answer to server
        socket.send(JSON.stringify({
            type: 'answer',
            questionId: currentQuestion.questionId,
            answer: answer
        }));
        
        // Update UI
        hasAnsweredCurrentQuestion = true;
        answerFormEl.classList.add('hidden');
        statusMessageEl.textContent = 'Answer submitted. Waiting for verification...';
    }
    
    function handleVerification(verification) {
        if (verification.correct) {
            statusMessageEl.textContent = 'Your answer was correct!';
            statusMessageEl.className = 'correct';
            updateScore(verification.newScore);
        } else {
            statusMessageEl.textContent = 'Your answer was incorrect.';
            statusMessageEl.className = 'incorrect';
        }
        
        // Reset after 3 seconds
        setTimeout(() => {
            statusMessageEl.className = '';
        }, 3000);
    }
    
    function updateScore(newScore) {
        score = newScore;
        playerScoreEl.textContent = score;
        
        // Animate the score change to draw attention
        playerScoreEl.classList.add('score-updated');
        setTimeout(() => {
            playerScoreEl.classList.remove('score-updated');
        }, 1000);
    }
    
    function updateLeaderboard(scores) {
        leaderboardListEl.innerHTML = '';
        
        scores.forEach((player, index) => {
            const playerEl = document.createElement('div');
            playerEl.className = 'leaderboard-item';
            
            // Highlight current player
            if (player.id === playerId) {
                playerEl.style.fontWeight = 'bold';
            }
            
            playerEl.textContent = `${index + 1}. ${player.name}: ${player.score} points`;
            leaderboardListEl.appendChild(playerEl);
        });
    }
    
    function resetPlayer() {
        // Reset game state
        currentQuestion = null;
        score = 0;
        hasAnsweredCurrentQuestion = false;
        
        // Update UI
        updateScore(0);
        currentQuestionEl.textContent = 'Waiting for host to select a question...';
        questionPointsEl.textContent = '';
        answerFormEl.classList.add('hidden');
        statusMessageEl.textContent = 'Game has been reset.';
    }
    
    // Event listeners
    registerButton.addEventListener('click', registerPlayer);
    
    submitAnswerButton.addEventListener('click', submitAnswer);
    
    answerInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            submitAnswer();
        }
    });
    
    // Initialize
    initializeWebSocket();
});
