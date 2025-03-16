document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const currentQuestionEl = document.getElementById('current-question');
    const questionPointsEl = document.getElementById('question-points');
    const playerAnswersEl = document.getElementById('player-answers');
    const scoresListEl = document.getElementById('scores-list');
    
    // Game state
    let currentQuestion = null;
    let playerAnswers = {};
    
    // WebSocket connection
    let socket;
    
    function initializeWebSocket() {
        socket = new WebSocket(`ws://${window.location.host}/ws/verify`);
        
        socket.onopen = () => {
            console.log('Connected to server as verifier');
        };
        
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connected':
                    console.log(`Connected as ${message.role}`);
                    break;
                    
                case 'questionActive':
                    setCurrentQuestion(message);
                    break;
                    
                case 'playerAnswer':
                    addPlayerAnswer(message);
                    break;
                    
                case 'scores':
                    updateScores(message.scores);
                    break;
                    
                case 'gameReset':
                    resetVerifier();
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
    
    function setCurrentQuestion(question) {
        currentQuestion = question;
        currentQuestionEl.textContent = question.questionText;
        questionPointsEl.textContent = `${question.points} points`;
        
        // Clear previous answers
        playerAnswers = {};
        playerAnswersEl.innerHTML = 'No answers yet';
    }
    
    function addPlayerAnswer(answer) {
        // Store the answer
        if (!playerAnswers[answer.playerId]) {
            playerAnswers[answer.playerId] = {
                name: answer.playerName,
                answer: answer.answer,
                verified: false
            };
        }
        
        // Update the UI
        renderAnswers();
    }
    
    function renderAnswers() {
        if (Object.keys(playerAnswers).length === 0) {
            playerAnswersEl.innerHTML = 'No answers yet';
            return;
        }
        
        playerAnswersEl.innerHTML = '';
        
        Object.entries(playerAnswers).forEach(([playerId, data]) => {
            if (data.verified) {
                return; // Skip verified answers
            }
            
            const answerEl = document.createElement('div');
            answerEl.className = 'player-answer';
            
            const infoEl = document.createElement('div');
            infoEl.innerHTML = `<strong>${data.name}</strong>: ${data.answer}`;
            
            const buttonsEl = document.createElement('div');
            buttonsEl.className = 'verification-buttons';
            
            const correctBtn = document.createElement('button');
            correctBtn.className = 'verify-button correct-button';
            correctBtn.textContent = 'Correct';
            correctBtn.addEventListener('click', () => {
                verifyAnswer(playerId, true);
            });
            
            const incorrectBtn = document.createElement('button');
            incorrectBtn.className = 'verify-button incorrect-button';
            incorrectBtn.textContent = 'Incorrect';
            incorrectBtn.addEventListener('click', () => {
                verifyAnswer(playerId, false);
            });
            
            buttonsEl.appendChild(correctBtn);
            buttonsEl.appendChild(incorrectBtn);
            
            answerEl.appendChild(infoEl);
            answerEl.appendChild(buttonsEl);
            
            playerAnswersEl.appendChild(answerEl);
        });
    }
    
    function verifyAnswer(playerId, correct) {
        if (!currentQuestion) {
            return;
        }
        
        // Mark as verified locally
        if (playerAnswers[playerId]) {
            playerAnswers[playerId].verified = true;
        }
        
        // Send verification to server
        socket.send(JSON.stringify({
            type: 'verification',
            playerId: playerId,
            questionId: currentQuestion.questionId,
            correct: correct
        }));
        
        // Update UI
        renderAnswers();
    }
    
    function updateScores(scores) {
        scoresListEl.innerHTML = '';
        
        scores.forEach(player => {
            const scoreEl = document.createElement('div');
            scoreEl.className = 'score-item';
            scoreEl.textContent = `${player.name}: ${player.score} points`;
            scoresListEl.appendChild(scoreEl);
        });
    }
    
    function resetVerifier() {
        currentQuestion = null;
        playerAnswers = {};
        currentQuestionEl.textContent = 'No question active';
        questionPointsEl.textContent = '';
        playerAnswersEl.innerHTML = 'No answers yet';
    }
    
    // Initialize
    initializeWebSocket();
});
