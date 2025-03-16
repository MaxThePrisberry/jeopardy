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
    let answeredQuestions = new Set(); // Track questions this player has already answered
    
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
                    
                    // Track questions player has already answered
                    if (message.answeredQuestions && Array.isArray(message.answeredQuestions)) {
                        answeredQuestions = new Set(message.answeredQuestions);
                    }
                    
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
        // Check if this is a new question
        const isNewQuestion = !currentQuestion || question.questionId !== currentQuestion.questionId;
        
        currentQuestion = question;
        currentQuestionEl.textContent = question.questionText;
        questionPointsEl.textContent = `${question.points} points`;
        
        // Check if player has already answered this question
        const hasAnswered = answeredQuestions.has(question.questionId);
        
        // Always reset answer input for new questions
        if (isNewQuestion) {
            answerInput.value = '';
            
            // Show answer form if player is registered and hasn't answered this question yet
            if (playerName && playerName !== '' && playerName.indexOf('Player-') !== 0) {
                if (!hasAnswered) {
                    answerFormEl.classList.remove('hidden');
                    answerInput.focus();
                    statusMessageEl.textContent = `New question available!`;
                } else {
                    answerFormEl.classList.add('hidden');
                    statusMessageEl.textContent = 'You have already answered this question. Waiting for verification...';
                }
            } else {
                answerFormEl.classList.add('hidden');
                statusMessageEl.textContent = 'Please enter your name and join the game to answer questions.';
            }
        }
    }
    
    function submitAnswer() {
        // Check if there's an active question
        if (!currentQuestion) {
            return;
        }
        
        // Check if player has already answered this question
        if (answeredQuestions.has(currentQuestion.questionId)) {
            statusMessageEl.textContent = 'You have already answered this question.';
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
        
        // Mark this question as answered
        answeredQuestions.add(currentQuestion.questionId);
        
        // Update UI
        answerFormEl.classList.add('hidden');
        statusMessageEl.textContent = 'Answer submitted. Waiting for verification...';
    }
    
    function handleVerification(verification) {
        if (verification.correct) {
            statusMessageEl.textContent = 'Your answer was correct!';
            statusMessageEl.className = 'status-message correct';
            updateScore(verification.newScore);
        } else {
            statusMessageEl.textContent = 'Your answer was incorrect.';
            statusMessageEl.className = 'status-message incorrect';
        }
        
        // Reset after 3 seconds
        setTimeout(() => {
            statusMessageEl.className = 'status-message';
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
            
            // Show connection status
            let statusText = "";
            if (player.connected === false) {
                statusText = " (disconnected)";
                playerEl.style.opacity = "0.7";
            }
            
            playerEl.textContent = `${index + 1}. ${player.name}${statusText}: ${player.score} points`;
            leaderboardListEl.appendChild(playerEl);
        });
    }
    
    function resetPlayer() {
        // Reset game state
        currentQuestion = null;
        score = 0;
        answeredQuestions.clear();
        
        // Update UI
        updateScore(0);
        currentQuestionEl.textContent = 'Waiting for host to select a question...';
        questionPointsEl.textContent = '';
        answerFormEl.classList.add('hidden');
        statusMessageEl.textContent = 'Game has been reset.';
    }
    
    // Event listeners
    registerButton.addEventListener('click', registerPlayer);
    
    // Add Enter key event for player name input
    playerNameInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            registerPlayer();
        }
    });
    
    submitAnswerButton.addEventListener('click', submitAnswer);
    
    answerInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            submitAnswer();
        }
    });
    
    // Initialize
    initializeWebSocket();
});
