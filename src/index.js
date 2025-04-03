require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType 
} = require('discord.js');

// Configuration
const config = {
  discordToken: process.env.DISCORD_BOT_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  verifiedRoleId: process.env.VERIFIED_ROLE_ID,
  verificationChannelId: process.env.VERIFICATION_CHANNEL_ID,
  guildId: process.env.GUILD_ID,
  quizQuestions: [
    {
      question: "What is the primary purpose of version control systems?",
      options: [
        "To design websites",
        "To track and manage source code changes",
        "To create databases",
        "To manage server configurations"
      ],
      correctAnswer: 1
    },
    {
      question: "What does Git stand for?",
      options: [
        "Global Information Tracker",
        "Git is not an acronym",
        "Graphic Interface Tool",
        "General Integration Technique"
      ],
      correctAnswer: 1
    },
    {
      question: "What is a pull request in GitHub?",
      options: [
        "A way to download code",
        "A method to merge code changes",
        "A type of Git command",
        "A server configuration"
      ],
      correctAnswer: 1
    },
    {
      question: "What is open-source software?",
      options: [
        "Software that costs nothing",
        "Software with source code available to modify and distribute",
        "A type of operating system",
        "A programming language"
      ],
      correctAnswer: 1
    },
    {
      question: "What is a repository in GitHub?",
      options: [
        "A type of database",
        "A project's file storage and version history",
        "A coding standard",
        "A type of server"
      ],
      correctAnswer: 1
    }
  ]
};

// Express app setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
  secret: process.env.SESSION_SECRET, 
  resave: false, 
  saveUninitialized: true,
  cookie: { secure: false } 
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Store verification states
const verificationStates = new Map();

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// Gatekeeper for new members
client.on('guildMemberAdd', async (member) => {
  try {
    // Find verification channel
    const verificationChannel = member.guild.channels.cache.get(config.verificationChannelId);
    
    if (!verificationChannel) {
      console.error('Verification channel not found');
      return;
    }

    // Generate a unique verification link
    const verificationLink = `https://blockdag-discord-bot.onrender.com/verify/${member.id}`;

    // Send verification message
    await verificationChannel.send({
      content: `Welcome ${member}! 

To access the server, please complete the verification process:
Click this link to start verification: ${verificationLink}

Verification steps:
1. Login with Discord
2. Authenticate your GitHub account
3. Complete a short technical quiz
4. Get access to the server channels`,
      allowedMentions: { users: [member.id] }
    });
  } catch (error) {
    console.error('Error handling new member:', error);
  }
});

// Verification route
app.get('/verify/:discordId', async (req, res) => {
  const { discordId } = req.params;
  
  // Generate a unique state
  const state = generateState();
  
  // Store verification state
  verificationStates.set(state, {
    discordId,
    timestamp: Date.now()
  });

  // Discord OAuth URL
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
    `client_id=${config.discordClientId}` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    `&response_type=code` +
    `&scope=identify` +
    `&state=${state}`;

  // Redirect to Discord OAuth
  res.redirect(discordAuthUrl);
});

// Discord OAuth Callback
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // Validate state
  const verificationState = verificationStates.get(state);
  if (!verificationState || Date.now() - verificationState.timestamp > 600000) {
    return res.status(400).send('Invalid or expired verification request');
  }

  try {
    // Exchange Discord code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Get Discord user info
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenResponse.data.access_token}`
      }
    });

    // Verify Discord ID matches
    if (userResponse.data.id !== verificationState.discordId) {
      return res.status(400).send('Discord account verification failed');
    }

    // Redirect to GitHub OAuth
    const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${config.githubClientId}` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent('https://blockdag-discord-bot.onrender.com/callback/github-callback')}`;


    res.redirect(githubAuthUrl);
  } catch (error) {
    console.error('Discord OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

// GitHub OAuth Callback
// GitHub OAuth Callback
app.get('/callback/github-callback', async (req, res) => {
    const { code, state } = req.query;
  
    // Validate state
    const verificationState = verificationStates.get(state);
    if (!verificationState || Date.now() - verificationState.timestamp > 600000) {
      return res.status(400).send('Invalid or expired verification request');
    }
  
    try {
      // Exchange GitHub code for access token
      const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        state
      }, {
        headers: {
          'Accept': 'application/json'
        }
      });
  
      // Render quiz start page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Verification Quiz</title>
          <style>
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              max-width: 800px; 
              margin: 0 auto; 
              padding: 20px; 
              text-align: center;
              line-height: 1.6;
              background-color: #f5f5f5;
              color: #333;
            }
            .instructions {
              background-color: white;
              border-radius: 15px;
              padding: 30px;
              margin-bottom: 30px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              transition: transform 0.3s ease;
            }
            .instructions:hover {
              transform: translateY(-5px);
            }
            #start-quiz {
              background-color: #5865F2;
              color: white;
              border: none;
              padding: 15px 40px;
              font-size: 18px;
              cursor: pointer;
              border-radius: 8px;
              transition: all 0.3s ease;
              font-weight: 600;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            #start-quiz:hover {
              background-color: #4752C4;
              transform: translateY(-2px);
              box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
            }
            #start-quiz:active {
              transform: translateY(0);
            }
            #quiz-container {
              display: none;
              opacity: 0;
              transition: opacity 0.5s ease;
            }
            #quiz-container.show {
              opacity: 1;
            }
            .question-container {
              background-color: white;
              border-radius: 15px;
              padding: 30px;
              margin-bottom: 20px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            #question {
              font-size: 1.5em;
              margin-bottom: 30px;
              color: #2C2F33;
              font-weight: 600;
            }
            #question-counter {
              color: #5865F2;
              font-weight: 600;
              margin-bottom: 20px;
            }
            .option {
              display: block;
              width: 100%;
              margin: 10px 0;
              padding: 15px;
              background-color: #f8f9fa;
              border: 2px solid #e9ecef;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.3s ease;
              font-size: 1.1em;
              color: #2C2F33;
            }
            .option:hover {
              background-color: #e9ecef;
              transform: translateX(5px);
            }
            .option:active {
              transform: translateX(0);
            }
            .option.selected {
              background-color: #5865F2;
              color: white;
              border-color: #4752C4;
            }
            .progress-bar {
              width: 100%;
              height: 10px;
              background-color: #e9ecef;
              border-radius: 5px;
              margin: 20px 0;
              overflow: hidden;
            }
            .progress {
              height: 100%;
              background-color: #5865F2;
              width: 0%;
              transition: width 0.3s ease;
            }
            h1 {
              color: #2C2F33;
              margin-bottom: 20px;
            }
            h2 {
              color: #5865F2;
              margin-top: 20px;
            }
            ul {
              text-align: left;
              margin: 20px 0;
            }
            li {
              margin: 10px 0;
              padding-left: 20px;
              position: relative;
            }
            li:before {
              content: "•";
              color: #5865F2;
              position: absolute;
              left: 0;
            }
          </style>
        </head>
        <body>
          <div class="instructions" id="instructions">
            <h1>Server Verification Quiz</h1>
            <p>To gain access to the server, you must complete a short technical quiz.</p>
            
            <h2>Quiz Details</h2>
            <ul>
              <li>Total Questions: 5</li>
              <li>Passing Threshold: 4 correct answers</li>
              <li>Topic: Technical and Programming Concepts</li>
            </ul>
            
            <h2>Rules</h2>
            <p>Read each question carefully and select the best answer. You must answer all questions to complete the verification.</p>
            
            <button id="start-quiz">Start Quiz</button>
          </div>
          
          <div id="quiz-container">
            <div class="question-container">
              <p id="question-counter">Question 1 of 5</p>
              <div class="progress-bar">
                <div class="progress" id="progress"></div>
              </div>
              <p id="question"></p>
              <div id="options">
                <button class="option" onclick="submitAnswer(0)">Option 1</button>
                <button class="option" onclick="submitAnswer(1)">Option 2</button>
                <button class="option" onclick="submitAnswer(2)">Option 3</button>
                <button class="option" onclick="submitAnswer(3)">Option 4</button>
              </div>
            </div>
          </div>
          
          <script>
          const discordId = '${verificationState.discordId}';
          const questions = ${JSON.stringify(config.quizQuestions)};
          let currentQuestionIndex = 0;
          let correctAnswers = 0;
          let selectedOption = null;
  
          // Start quiz button functionality
          document.getElementById('start-quiz').addEventListener('click', () => {
            document.getElementById('instructions').style.display = 'none';
            const quizContainer = document.getElementById('quiz-container');
            quizContainer.style.display = 'block';
            setTimeout(() => quizContainer.classList.add('show'), 10);
            
            // Initialize first question
            updateQuestion();
          });

          function updateQuestion() {
            // Update progress bar
            const progress = (currentQuestionIndex / questions.length) * 100;
            document.getElementById('progress').style.width = \`\${progress}%\`;
            
            // Update question counter
            document.getElementById('question-counter').textContent = \`Question \${currentQuestionIndex + 1} of \${questions.length}\`;
            
            // Update question text
            document.getElementById('question').textContent = questions[currentQuestionIndex].question;
            
            // Update options
            const buttons = document.querySelectorAll('.option');
            buttons.forEach((button, index) => {
              button.textContent = questions[currentQuestionIndex].options[index];
              button.classList.remove('selected');
            });
            
            // Reset selected option
            selectedOption = null;
          }
  
          function submitAnswer(selectedIndex) {
            if (selectedOption !== null) return; // Prevent multiple submissions
            
            selectedOption = selectedIndex;
            const currentQuestion = questions[currentQuestionIndex];
            const buttons = document.querySelectorAll('.option');
            
            // Visual feedback
            buttons[selectedIndex].classList.add('selected');
            
            if (selectedIndex === currentQuestion.correctAnswer) {
              correctAnswers++;
            }
  
            currentQuestionIndex++;
  
            if (currentQuestionIndex >= questions.length) {
              // Send quiz results
              fetch('/submit-quiz', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                  discordId, 
                  correctAnswers 
                })
              }).then(response => {
                if (response.ok) {
                  window.location.href = '/success';
                } else {
                  window.location.href = '/failure';
                }
              });
              return;
            }
  
            // Update to next question after a short delay
            setTimeout(updateQuestion, 1000);
          }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      res.status(500).send('Authentication failed');
    }
  });

// Submit quiz results
app.post('/submit-quiz', async (req, res) => {
  const { discordId, correctAnswers } = req.body;

  try {
    // Verify quiz passed
    if (correctAnswers >= 4) {
      // Get the guild
      const guild = await client.guilds.fetch(config.guildId);
      
      // Find the member
      const member = await guild.members.fetch(discordId);
      
      // Add verified role
      const verifiedRole = guild.roles.cache.get(config.verifiedRoleId);
      if (verifiedRole) {
        await member.roles.add(verifiedRole);
        res.status(200).send('Verification successful');
      } else {
        res.status(500).send('Verified role not found');
      }
    } else {
      res.status(400).send('Quiz not passed');
    }
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).send('Verification failed');
  }
});

// Success and failure routes
app.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Verification Successful</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
      </style>
    </head>
    <body>
      <h1>Verification Successful!</h1>
      <p>You have been verified and granted access to the server.</p>
      <p>You can now close this window and return to the Discord server.</p>
    </body>
    </html>
  `);
});

app.get('/failure', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Verification Failed</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
      </style>
    </head>
    <body>
      <h1>Verification Failed</h1>
      <p>You did not pass the verification quiz.</p>
      <p>Please rejoin the server and try again.</p>
    </body>
    </html>
  `);
});

// Generate unique state
function generateState() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Client ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Start the server and Discord bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

client.login(config.discordToken);

module.exports = { app, client };