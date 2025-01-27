const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const stopword = require("stopword");
const { Configuration, OpenAIApi } = require("openai");
const moment = require("moment");
const { HfInference } = require("@huggingface/inference");



require("dotenv").config();

// Middleware
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAIApi(
    new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);
const hf = new HfInference("<your_hugging_face_api_key>");

// Connect to MongoDB
const mongoUR = 'mongodb://localhost:27017/message-analyzer';
const mongoURI = 'mongodb+srv://Rupesh:Rupesh1admin@diary.fyt8efp.mongodb.net/?retryWrites=true&w=majority&appName=Diary';
mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Message Schema and Model
const messageSchema = new mongoose.Schema({
    sender: String,
    message: String,
    timestamp: Date,
});

const Message = mongoose.model('Message', messageSchema);

async function analyzeMessage(message) {
    const result = await hf.textClassification({
        model: "nlptown/bert-base-multilingual-uncased-sentiment",
        inputs: message,
    });
    console.log(result);
    return result;
}

const hinglishStopWords = [
    "aur", "lekin", "hai", "ka", "ki", "ke", "mein", "ko", "se", "hi", "bhi",
];

const redFlagWords = [
    "gussa", "ignore", "jealous", "hate", "toxic", "ladai", "bekar",
];

const complimentWords = [
    "achha", "pyaara", "mast", "shandar", "badhia", "awesome", "cute", "amazing", "great", "good", "wonderful", "love"
];
function parseChatText(chatText) {
    const lines = chatText.split("\n");
    const messages = [];
    const regex = /^\[(\d{2}\/\d{2}\/\d{4}), (\d{1,2}:\d{2} (AM|PM))\] (.+?): (.+)$/;

    lines.forEach((line) => {
        const match = line.match(regex);
        if (match) {
            const [unused1, date, time, _, sender, message] = match;
            const timestamp = moment(`${date} ${time}`, "MM/DD/YYYY hh:mm A").toDate();
            messages.push({ sender, message, timestamp });
        }
    });

    return messages;
}


// Helper function for LLM sentiment and red flag analysis
async function analyzeWithLLM(message) {
    try {
        const prompt = `Analyze the following Hinglish message:
         "${message}" and provide:
      1. Sentiment (Positive, Negative, Neutral,lovable ,annoying ,avoiding).
      2. Whether it contains any red flags (if yes, list them).`;

        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt,
            max_tokens: 100,
        });

        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error("Error with LLM analysis:", error);
        return null;
    }
}



// Routes
app.get('/', (req, res) => {
    res.send('Welcome to the Message Analyzer API!');
});

// Endpoint to upload chat history
app.post('/upload', async (req, res) => {
    try {
        const chatText = req.body.chatText; // Expecting plain text chat history
        const messages = parseChatText(chatText);
        await Message.insertMany(messages);
        res.status(200).json({ message: 'Chat history uploaded successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload chat history.' });
    }
});

// /analyze endpoint
router.post("/analyze", async (req, res) => {
    try {
        const messages = req.body.messages; // Expecting an array of messages

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid messages format" });
        }

        // Message count per person
        const messageCounts = messages.reduce((acc, msg) => {
            acc[msg.sender] = (acc[msg.sender] || 0) + 1;
            return acc;
        }, {});

        // Top words per person
        const topWords = {};
        messages.forEach(({ sender, message }) => {
            const words = stopword.removeStopwords(message.toLowerCase().split(" "), hinglishStopWords);
            topWords[sender] = topWords[sender] || {};
            words.forEach((word) => {
                topWords[sender][word] = (topWords[sender][word] || 0) + 1;
            });
        });
        const sortedTopWords = Object.fromEntries(
            Object.entries(topWords).map(([sender, words]) => [
                sender,
                Object.entries(words).sort(([, a], [, b]) => b - a).slice(0, 5),
            ])
        );

        // Response time analysis
        const responseTimes = [];
        for (let i = 1; i < messages.length; i++) {
            if (messages[i].sender !== messages[i - 1].sender) {
                const diff = moment(messages[i].timestamp).diff(
                    moment(messages[i - 1].timestamp),
                    "minutes"
                );
                responseTimes.push(diff);
            }
        }
        const averageResponseTime =
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

        // Sentiment, compliments, and red flags analysis
        const interestLevel = {};
        const compliments = {};
        const redFlags = [];
        const monthlyMessages = {};

        for (const { sender, message, timestamp } of messages) {
            // Use LLM to analyze sentiment and red flags
            const llmAnalysis = await analyzeWithLLM(message);

            if (llmAnalysis) {
                const sentimentMatch = llmAnalysis.match(/Sentiment: (.+)/i);
                const redFlagMatch = llmAnalysis.match(/Red flags: (.+)/i);

                // Calculate interest level based on sentiment
                if (sentimentMatch) {
                    const sentiment = sentimentMatch[1].toLowerCase();
                    interestLevel[sender] =
                        (interestLevel[sender] || 0) +
                        (sentiment === "positive" ? 2 : sentiment === "neutral" ? 1 : 0);
                }

                // Detect red flags
                if (redFlagMatch) {
                    const detectedFlags = redFlagMatch[1];
                    if (detectedFlags && detectedFlags !== "None") {
                        redFlags.push({ sender, message, detectedFlags });
                    }
                }
            }

            // Compliment detection (keyword-based for now)
            compliments[sender] =
                (compliments[sender] || 0) +
                complimentWords.filter((word) =>
                    message.toLowerCase().includes(word)
                ).length;

            // Monthly message grouping
            const month = moment(timestamp).format("MMM YYYY");
            monthlyMessages[month] = monthlyMessages[month] || { [sender]: 0 };
            monthlyMessages[month][sender] =
                (monthlyMessages[month][sender] || 0) + 1;
        }

        // Response object
        const analysis = {
            messageCounts,
            sortedTopWords,
            averageResponseTime,
            interestLevel,
            compliments,
            redFlags,
            monthlyMessages,
        };

        return res.status(200).json(analysis);
    } catch (error) {
        console.error("Error in /analyze:", error);
        res.status(500).json({ error: "Failed to analyze messages." });
    }
});




// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
