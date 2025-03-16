document.addEventListener('DOMContentLoaded', () => {
    // Sample categories and questions (default data)
    let gameData = {
        categories: [
            'Science', 'History', 'Geography', 'Literature', 'Sports', 'Entertainment'
        ],
        questions: [
            // Science
            [
                { id: 'sci100', text: 'The chemical symbol Fe stands for this element', points: 100 },
                { id: 'sci200', text: 'This planet is known as the Red Planet', points: 200 },
                { id: 'sci300', text: 'The conversion of sugar into acids, alcohol, or gases is called this', points: 300 },
                { id: 'sci400', text: 'This scientist formulated the theory of relativity', points: 400 },
                { id: 'sci500', text: 'This particle was discovered in 2012 at CERN', points: 500 }
            ],
            // History
            [
                { id: 'his100', text: 'This document begins with "We the People"', points: 100 },
                { id: 'his200', text: 'The year World War II ended', points: 200 },
                { id: 'his300', text: 'This civilization built the Great Pyramid of Giza', points: 300 },
                { id: 'his400', text: 'This treaty ended World War I', points: 400 },
                { id: 'his500', text: 'This emperor built the Colosseum in Rome', points: 500 }
            ],
            // Geography
            [
                { id: 'geo100', text: 'This is the largest ocean on Earth', points: 100 },
                { id: 'geo200', text: 'This is the capital of France', points: 200 },
                { id: 'geo300', text: 'The Amazon River is located on this continent', points: 300 },
                { id: 'geo400', text: 'This mountain is the tallest in the world', points: 400 },
                { id: 'geo500', text: 'This strait separates Europe and Africa', points: 500 }
            ],
            // Literature
            [
                { id: 'lit100', text: 'Author of "Romeo and Juliet"', points: 100 },
                { id: 'lit200', text: 'This character says "The name is Bond, James Bond"', points: 200 },
                { id: 'lit300', text: 'Author of "1984" and "Animal Farm"', points: 300 },
                { id: 'lit400', text: 'This novel begins with "Call me Ishmael"', points: 400 },
                { id: 'lit500', text: 'This American poet wrote "The Road Not Taken"', points: 500 }
            ],
            // Sports
            [
                { id: 'spt100', text: 'Number of players on a standard soccer team', points: 100 },
                { id: 'spt200', text: 'This sport uses a shuttlecock', points: 200 },
                { id: 'spt300', text: 'The Olympic Games are held every this many years', points: 300 },
                { id: 'spt400', text: 'This team has won the most Super Bowls', points: 400 },
                { id: 'spt500', text: 'This country invented the sport of cricket', points: 500 }
            ],
            // Entertainment
            [
                { id: 'ent100', text: 'This actor played Jack in "Titanic"', points: 100 },
                { id: 'ent200', text: 'This is the highest-grossing film of all time', points: 200 },
                { id: 'ent300', text: 'This singer is known as the "King of Pop"', points: 300 },
                { id: 'ent400', text: 'This TV show featured the character Walter White', points: 400 },
                { id: 'ent500', text: 'This band performed "Bohemian Rhapsody"', points: 500 }
            ]
        ]
    };

    // Elements
    const categoriesEl = document.querySelector('.categories');
    const questionsGridEl = document.querySelector('.questions-grid');
    const currentQuestionEl = document.getElementById('current-question');
    const questionPointsEl = document.getElementById('question-points');
    const playersEl = document.getElementById('players');
    const resetGameBtn = document.getElementById('reset-game');

    // Import elements - will be added to the HTML
    const importContainerEl = document.createElement('div');
    importContainerEl.className = 'import-container';
    importContainerEl.innerHTML = `
        <h2>Import Questions</h2>
        <div class="import-controls">
            <input type="file" id="import-file" accept=".json" />
            <button id="import-button">Import Questions</button>
        </div>
        <div id="import-status"></div>
    `;
    
    // Insert import container after game-board
    const gameBoardEl = document.querySelector('.game-board');
    gameBoardEl.parentNode.insertBefore(importContainerEl, gameBoardEl.nextSibling);
    
    const importFileEl = document.getElementById('import-file');
    const importButtonEl = document.getElementById('import-button');
    const importStatusEl = document.getElementById('import-status');

    // WebSocket connection
    let socket;
    let selectedQuestion = null;
    let selectedQuestionCells = new Set(); // Keep track of selected question cells
    
    function initializeWebSocket() {
        // Simple protocol detection
        const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss';
        socket = new WebSocket(`${protocol}://${window.location.host}/ws/host`);
        
        socket.onopen = () => {
            console.log('Connected to server as host');
        };
        
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connected':
                    console.log(`Connected as ${message.role}`);
                    break;
                    
                case 'playerList':
                    updatePlayerList(message.players);
                    break;
                    
                case 'playerAnswered':
                    notifyPlayerAnswered(message.playerName);
                    break;
                    
                case 'scores':
                    // Host doesn't need to do anything special with scores
                    break;
                    
                case 'gameReset':
                    resetGameBoard();
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
    
    function initializeGameBoard() {
        // Add categories
        categoriesEl.innerHTML = '';
        gameData.categories.forEach(category => {
            const categoryEl = document.createElement('div');
            categoryEl.className = 'category';
            categoryEl.textContent = category;
            categoriesEl.appendChild(categoryEl);
        });
        
        // Add questions
        questionsGridEl.innerHTML = '';
        selectedQuestionCells.clear(); // Clear the selected questions set
        
        for (let pointIndex = 0; pointIndex < gameData.questions[0].length; pointIndex++) {
            for (let catIndex = 0; catIndex < gameData.categories.length; catIndex++) {
                if (!gameData.questions[catIndex] || !gameData.questions[catIndex][pointIndex]) {
                    console.error(`Missing question data at category ${catIndex}, point index ${pointIndex}`);
                    continue;
                }
                
                const question = gameData.questions[catIndex][pointIndex];
                const questionCell = document.createElement('div');
                questionCell.className = 'question-cell';
                questionCell.textContent = question.points;
                questionCell.dataset.id = question.id;
                questionCell.dataset.text = question.text;
                questionCell.dataset.points = question.points;
                questionCell.dataset.category = gameData.categories[catIndex];
                
                questionCell.addEventListener('click', () => {
                    // Only allow selection if the cell hasn't been selected before
                    if (!selectedQuestionCells.has(question.id)) {
                        selectQuestion(question);
                        questionCell.classList.add('selected');
                        selectedQuestionCells.add(question.id); // Mark as selected
                    }
                });
                
                questionsGridEl.appendChild(questionCell);
            }
        }
    }
    
    function selectQuestion(question) {
        selectedQuestion = question;
        currentQuestionEl.textContent = question.text;
        questionPointsEl.textContent = `${question.points} points`;
        
        // Send to server
        socket.send(JSON.stringify({
            type: 'question',
            questionId: question.id,
            questionText: question.text,
            points: question.points
        }));
    }
    
    function updatePlayerList(players) {
        // Sort players by score (descending)
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        
        playersEl.innerHTML = '';
        
        sortedPlayers.forEach((player, index) => {
            const playerEl = document.createElement('li');
            
            // Show connection status
            let statusText = "";
            if (player.connected === false) {
                statusText = " (disconnected)";
                playerEl.style.opacity = "0.7";
            }
            
            playerEl.textContent = `${index + 1}. ${player.name}${statusText}: ${player.score} points`;
            playersEl.appendChild(playerEl);
        });
    }
    
    function notifyPlayerAnswered(playerName) {
        // You could add a visual indicator that a player has answered
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = `${playerName} has submitted an answer`;
        
        document.querySelector('.host-container').appendChild(notification);
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    function resetGameBoard() {
        // Reset selected question
        selectedQuestion = null;
        currentQuestionEl.textContent = 'No question selected';
        questionPointsEl.textContent = '';
        
        // Clear selected questions set
        selectedQuestionCells.clear();
        
        // Reset all question cells
        const questionCells = document.querySelectorAll('.question-cell');
        questionCells.forEach(cell => {
            cell.classList.remove('selected');
        });
    }
    
    function importQuestions(file) {
        const reader = new FileReader();
        
        reader.onload = function(event) {
            try {
                const importedData = JSON.parse(event.target.result);
                
                // Validate imported data
                if (!importedData.categories || !Array.isArray(importedData.categories) || 
                    !importedData.questions || !Array.isArray(importedData.questions)) {
                    throw new Error('Invalid format: Missing categories or questions array');
                }
                
                // Basic validation on categories
                if (importedData.categories.length === 0) {
                    throw new Error('Invalid format: No categories found');
                }
                
                // Basic validation on questions
                if (importedData.questions.length === 0) {
                    throw new Error('Invalid format: No questions found');
                }
                
                // Check that each category has a matching question array
                if (importedData.categories.length !== importedData.questions.length) {
                    throw new Error('Invalid format: Number of categories does not match number of question arrays');
                }
                
                // Validate each question has required fields
                for (let catIndex = 0; catIndex < importedData.questions.length; catIndex++) {
                    const categoryQuestions = importedData.questions[catIndex];
                    
                    if (!Array.isArray(categoryQuestions)) {
                        throw new Error(`Invalid format: Questions for category ${catIndex} is not an array`);
                    }
                    
                    for (let qIndex = 0; qIndex < categoryQuestions.length; qIndex++) {
                        const q = categoryQuestions[qIndex];
                        if (!q.id || !q.text || !q.points) {
                            throw new Error(`Invalid question at category ${catIndex}, index ${qIndex}: missing id, text, or points`);
                        }
                    }
                }
                
                // If validation passes, update game data
                gameData = importedData;
                
                // Update the game board
                initializeGameBoard();
                
                // Update status
                importStatusEl.textContent = 'Questions imported successfully!';
                importStatusEl.className = 'success';
                
                // Clear file input
                importFileEl.value = '';
                
            } catch (error) {
                console.error('Error importing questions:', error);
                importStatusEl.textContent = `Error: ${error.message}`;
                importStatusEl.className = 'error';
            }
        };
        
        reader.onerror = function() {
            importStatusEl.textContent = 'Error reading file';
            importStatusEl.className = 'error';
        };
        
        reader.readAsText(file);
    }
    
    // Event listeners
    resetGameBtn.addEventListener('click', () => {
        socket.send(JSON.stringify({
            type: 'reset'
        }));
    });
    
    importButtonEl.addEventListener('click', () => {
        if (importFileEl.files.length === 0) {
            importStatusEl.textContent = 'Please select a file to import';
            importStatusEl.className = 'error';
            return;
        }
        
        importQuestions(importFileEl.files[0]);
    });
    
    // Initialize
    initializeGameBoard();
    initializeWebSocket();
});
