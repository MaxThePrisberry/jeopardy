# Online Jeopardy Game

A real-time, multi-player Jeopardy-style game that can be played in a browser. Perfect for classrooms, team-building events, or remote get-togethers.

## Features

- **Multi-user roles**: Host, Players, and Answer Verifier
- **Real-time gameplay** via WebSockets
- **Player persistence** across refreshes and disconnects
- **Customizable questions** via JSON import
- **Mobile-friendly** responsive design
- **Session management** with automatic reconnection
- **Game history** saved automatically
- **Score tracking** and leaderboard

## Prerequisites

- Node.js (v14+)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/jeopardy-game.git
cd jeopardy-game
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

4. Access the game:
```
http://localhost:4000
```

## Game Roles

### Host
The host controls the game board, selects questions, and can reset the game.

- Access via `/host` route
- Only one host connection is allowed at a time
- Can import custom question sets
- Can reset the game

### Players
Players join the game with a name, answer questions, and compete for points.

- Access via `/player` route
- Enter a name to join the game
- Submit answers to questions selected by the host
- View the leaderboard and current score

### Verifier
The verifier reviews player answers and marks them as correct or incorrect.

- Access via `/verify` route
- Only one verifier connection is allowed at a time
- Can see all player answers to current and past questions
- Can mark answers correct or incorrect
- Can change verification decisions

## Game Setup

### Default Questions
The game comes with a default set of questions covering Science, History, Geography, Literature, Sports, and Entertainment.

### Custom Questions
You can create and import custom question sets in JSON format:

```json
{
  "categories": ["Category 1", "Category 2", "Category 3"],
  "questions": [
    [
      {"id": "cat1_100", "text": "Question text", "points": 100},
      {"id": "cat1_200", "text": "Question text", "points": 200}
    ],
    [
      {"id": "cat2_100", "text": "Question text", "points": 100},
      {"id": "cat2_200", "text": "Question text", "points": 200}
    ],
    [
      {"id": "cat3_100", "text": "Question text", "points": 100},
      {"id": "cat3_200", "text": "Question text", "points": 200}
    ]
  ]
}
```

To import:
1. Go to the Host view
2. Click "Import Questions"
3. Select your JSON file
4. Click "Import"

## Game Flow

1. **Setup**: Host loads the game and optionally imports custom questions
2. **Join**: Players join by entering their names
3. **Play**:
   - Host selects a question from the game board
   - Question appears on all players' screens
   - Players submit their answers
   - Verifier marks answers as correct or incorrect
   - Points are awarded accordingly
4. **Continue**: Host selects the next question
5. **End**: When all questions are answered or at any time, the host can reset the game

## Technical Details

### Technologies Used
- **Backend**: Node.js, Express
- **Real-time Communication**: WebSockets (ws)
- **Frontend**: Vanilla JavaScript, HTML, CSS

### Player Persistence
Players maintain their identity, score, and game state even if they refresh their browser or temporarily disconnect. The game uses cookies and server-side session tracking to enable this feature.

### Game Results
When the game is reset, a JSON file with game results is automatically saved to the `game_results` directory. These files include:
- Timestamp
- Player information
- Scores
- Questions and answers
- Verification decisions

## File Structure

```
├── server.js              # Main server application
├── package.json           # Project dependencies
├── public/                # Static frontend files
│   ├── index.html         # Landing page
│   ├── host.html          # Host interface
│   ├── host.js            # Host functionality
│   ├── player.html        # Player interface
│   ├── player.js          # Player functionality
│   ├── verify.html        # Verifier interface
│   ├── verify.js          # Verifier functionality
│   └── styles.css         # Shared styles
└── game_results/          # Saved game results
```

## Security Considerations

This application is designed for local or trusted network use. It doesn't include authentication or encryption features beyond what's provided by HTTPS if configured.

## Troubleshooting

### Common Issues

**Players can't connect to the game**
- Ensure the server is running
- Check that players are using the correct URL
- Verify network connectivity

**Imported questions don't appear**
- Check the JSON file format matches the expected structure
- Look for error messages in the import status area
- Check browser console for detailed errors

**Player score doesn't update**
- Scores update every 5 seconds
- Verify that the verifier has marked the answer
- Check network connectivity

## License

[MIT License](LICENSE)

## Acknowledgments

- Inspired by the classic Jeopardy! TV game show
- Built with Node.js and WebSockets
