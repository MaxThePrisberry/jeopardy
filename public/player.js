document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const registrationEl = document.getElementById('registration');
    const playerStatusEl = document.getElementById('player-status');
    const playerNameInput = document.getElementById('player-name');
    const registerButton = document.getElementById('register-button');
    const playerScoreEl = document.getElementById('player-score');
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
        socket = new WebSocket(`ws://${window.location.host}/ws/player`);
        
        socket.onopen = () => {
            console.log('Connected to server as player');
        };
        
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connected':
                    console.log(`Connected as ${message.role}`);
                    break;
                    
                case 'gameState':
                    playerId = message.id;
                    updateScore(message.score);
                    
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
    }
    
    function setCurrentQuestion(question) {
        currentQuestion = question;
        currentQuestionEl.textContent = question.questionText;
        questionPointsEl.textContent = `${question.points} points`;
        
        // Reset answer state
        hasAnsweredCurrentQuestion = false;
        answerInput.value = '';
        answerFormEl.classList.remove('hidden');
        
        // Focus the answer input
        answerInput.focus();
    }
    
    function submitAnswer() {
        if (!currentQuestion || hasAnsweredCurrentQuestion) {
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
