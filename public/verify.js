document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const currentQuestionEl = document.getElementById('current-question');
    const questionPointsEl = document.getElementById('question-points');
    const playerAnswersEl = document.getElementById('player-answers');
    const scoresListEl = document.getElementById('scores-list');
    
    // Game state
    let currentQuestion = null;
    let allQuestions = {}; // Stores all questions by id
    let playerAnswers = {}; // Maps questionId -> playerId -> answer
    
    // WebSocket connection
    let socket;
    
    function initializeWebSocket() {
        // Simple protocol detection
        const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss';
        socket = new WebSocket(`${protocol}://${window.location.host}/ws/verify`);
        
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
        
        // Store question information
        allQuestions[question.questionId] = {
            text: question.questionText,
            points: question.points,
            timestamp: new Date()
        };
        
        // Initialize answers for this question if not already present
        if (!playerAnswers[question.questionId]) {
            playerAnswers[question.questionId] = {};
        }
        
        // Render all answers grouped by question
        renderAllAnswers();
    }
    
    function addPlayerAnswer(answer) {
        const { questionId, playerId, playerName, answer: answerText } = answer;
        
        // Ensure we have question information
        if (!allQuestions[questionId]) {
            allQuestions[questionId] = {
                text: "Unknown Question",
                points: 0,
                timestamp: new Date()
            };
        }
        
        // Ensure the question has an answers object
        if (!playerAnswers[questionId]) {
            playerAnswers[questionId] = {};
        }
        
        // Store the player's answer
        playerAnswers[questionId][playerId] = {
            name: playerName,
            answer: answerText,
            verified: false,
            timestamp: new Date()
        };
        
        // Update the UI
        renderAllAnswers();
    }
    
    function renderAllAnswers() {
        // Clear previous content
        playerAnswersEl.innerHTML = '';
        
        // Get all question IDs and sort by timestamp (newest first)
        const questionIds = Object.keys(allQuestions)
            .sort((a, b) => {
                const timeA = allQuestions[a].timestamp || new Date(0);
                const timeB = allQuestions[b].timestamp || new Date(0);
                return timeB - timeA;
            });
        
        if (questionIds.length === 0) {
            playerAnswersEl.innerHTML = '<div class="no-answers">No questions have been asked yet</div>';
            return;
        }
        
        // Create a section for each question
        questionIds.forEach(questionId => {
            const question = allQuestions[questionId];
            const answers = playerAnswers[questionId] || {};
            const hasUnverifiedAnswers = Object.values(answers).some(a => !a.verified);
            
            // Create question section
            const questionSection = document.createElement('div');
            questionSection.className = 'question-section';
            if (currentQuestion && currentQuestion.questionId === questionId) {
                questionSection.classList.add('current-question');
            }
            
            // Add question header
            const questionHeader = document.createElement('div');
            questionHeader.className = 'question-header';
            questionHeader.innerHTML = `
                <h3>${question.text} (${question.points} points)</h3>
                <div class="question-status ${hasUnverifiedAnswers ? 'pending' : 'complete'}">
                    ${hasUnverifiedAnswers ? 'Pending Answers' : 'All Verified'}
                </div>
            `;
            
            // Add question timestamp
            if (question.timestamp) {
                const timestampEl = document.createElement('div');
                timestampEl.className = 'question-timestamp';
                timestampEl.textContent = `Asked at ${question.timestamp.toLocaleTimeString()}`;
                questionHeader.appendChild(timestampEl);
            }
            
            questionSection.appendChild(questionHeader);
            
            // Add answers for this question
            const answersList = document.createElement('div');
            answersList.className = 'answers-list';
            
            const playerIds = Object.keys(answers);
            
            if (playerIds.length === 0) {
                answersList.innerHTML = '<div class="no-answers">No answers submitted yet</div>';
            } else {
                // Sort answers by timestamp (newest first) and then by verification status
                playerIds
                    .sort((a, b) => {
                        // First sort by verification status (unverified first)
                        if (answers[a].verified !== answers[b].verified) {
                            return answers[a].verified ? 1 : -1;
                        }
                        // Then sort by timestamp
                        const timeA = answers[a].timestamp || new Date(0);
                        const timeB = answers[b].timestamp || new Date(0);
                        return timeB - timeA;
                    })
                    .forEach(playerId => {
                        const playerData = answers[playerId];
                        
                        if (playerData.verified) {
                            // For verified answers, just show a simple status
                            const verifiedEl = document.createElement('div');
                            verifiedEl.className = 'verified-answer';
                            verifiedEl.innerHTML = `
                                <strong>${playerData.name}</strong>: ${playerData.answer}
                                <span class="status ${playerData.correct ? 'correct' : 'incorrect'}">
                                    ${playerData.correct ? 'Correct' : 'Incorrect'}
                                </span>
                            `;
                            answersList.appendChild(verifiedEl);
                        } else {
                            // For unverified answers, show verification buttons
                            const answerEl = document.createElement('div');
                            answerEl.className = 'player-answer';
                            
                            const infoEl = document.createElement('div');
                            infoEl.innerHTML = `<strong>${playerData.name}</strong>: ${playerData.answer}`;
                            
                            const buttonsEl = document.createElement('div');
                            buttonsEl.className = 'verification-buttons';
                            
                            const correctBtn = document.createElement('button');
                            correctBtn.className = 'verify-button correct-button';
                            correctBtn.textContent = 'Correct';
                            correctBtn.addEventListener('click', () => {
                                verifyAnswer(questionId, playerId, true);
                            });
                            
                            const incorrectBtn = document.createElement('button');
                            incorrectBtn.className = 'verify-button incorrect-button';
                            incorrectBtn.textContent = 'Incorrect';
                            incorrectBtn.addEventListener('click', () => {
                                verifyAnswer(questionId, playerId, false);
                            });
                            
                            buttonsEl.appendChild(correctBtn);
                            buttonsEl.appendChild(incorrectBtn);
                            
                            answerEl.appendChild(infoEl);
                            answerEl.appendChild(buttonsEl);
                            
                            answersList.appendChild(answerEl);
                        }
                    });
            }
            
            questionSection.appendChild(answersList);
            playerAnswersEl.appendChild(questionSection);
        });
    }
    
    function verifyAnswer(questionId, playerId, correct) {
        // Mark as verified locally
        if (playerAnswers[questionId] && playerAnswers[questionId][playerId]) {
            playerAnswers[questionId][playerId].verified = true;
            playerAnswers[questionId][playerId].correct = correct;
            
            // Send verification to server
            socket.send(JSON.stringify({
                type: 'verification',
                playerId: playerId,
                questionId: questionId,
                correct: correct
            }));
            
            // Update UI
            renderAllAnswers();
        }
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
        // Just clear the current question - we keep the history
        currentQuestion = null;
        currentQuestionEl.textContent = 'No question active';
        questionPointsEl.textContent = '';
        
        // Re-render the answers
        renderAllAnswers();
    }
    
    // Initialize
    initializeWebSocket();
});
