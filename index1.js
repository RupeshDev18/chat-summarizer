const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const moment = require("moment");
const stopword = require("stopword");
const { OpenAI } = require("openai");
const multer = require("multer");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// OpenAI API
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// MongoDB Connection
const mongoURI =
    "mongodb+srv://Rupesh:Rupesh1admin@diary.fyt8efp.mongodb.net/?retryWrites=true&w=majority&appName=Diary";

mongoose
    .connect(mongoURI)
    .then(() => console.log("MongoDB connected successfully."))
    .catch((err) => console.error("MongoDB connection error:", err));

// Mongoose Schema and Model
const messageSchema = new mongoose.Schema({
    sender: String,
    message: String,
    timestamp: Date,
});

const Message = mongoose.model("Message", messageSchema);

// Stop Words for Hinglish
const hinglishStopWords = [
    "aur",
    "lekin",
    "hai",
    "ka",
    "ki",
    "ke",
    "mein",
    "ko",
    "se",
    "hi",
    "bhi",
    "h",
    "to",
    "mai",
    "tha"
];

// Function: Parse Chat Text
function parseChatText(chatText) {
    const lines = chatText.split("\n");
    const messages = [];
    const regex = /^(\d{2}\/\d{2}\/\d{2}), (\d{2}:\d{2}) - (.+?): (.+)$/;

    lines.forEach((line) => {
        const match = line.match(regex);
        if (match) {
            const [_, date, time, sender, message] = match;

            // Combine date and time to create a timestamp
            const timestamp = moment(`${date}, ${time}`, "DD/MM/YY, HH:mm").toDate();

            messages.push({ sender, message, timestamp });
        }
    });

    return messages;
}

function groupMessagesBySession(messages) {
    const groupedMessages = [];
    let currentGroup = [];

    for (let i = 0; i < messages.length; i++) {
        const currentMessage = messages[i];
        const previousMessage = messages[i - 1];

        if (
            previousMessage &&
            moment(currentMessage.timestamp).diff(moment(previousMessage.timestamp), "hours") >= 24
        ) {
            // If the time difference is 24 hours or more, finalize the current group
            groupedMessages.push(currentGroup);
            currentGroup = [];
        }

        // Add the current message to the group
        currentGroup.push(currentMessage);
    }

    // Push the last group
    if (currentGroup.length > 0) {
        groupedMessages.push(currentGroup);
    }

    return groupedMessages;
}


// Function: Analyze with LLM (OpenAI)
async function analyzeWithLLM(message) {
    try {
        const prompt = `Analyze the following Hinglish message:
      "${message}" and provide:
      1. Sentiment (Positive, Negative, Neutral, Lovable, Annoying, Avoiding).
      2. Whether it contains any red flags (if yes, list them).
      3. Whether it contains compliments (if yes, list them).`;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "system", content: prompt }],
            max_tokens: 100,
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error with LLM analysis:", error);
        return null;
    }
}
async function analyzeSessionWithLLM(session) {
    try {
        // Format the session as a conversation for the prompt
        const formattedSession = session
            .map(({ sender, message }) => `- [${sender}] ${message}`)
            .join("\n");

        const prompt = `Analyze the following chat session:
        ${formattedSession}
        
        Provide the following insights:
        1. Overall sentiment of the conversation (Positive, Negative, Neutral, Lovable, Annoying, Avoiding).
        2. List any red flags in the conversation.
        3. Identify compliments in the conversation, if any.
        4. Provide a summary of the conversation.`;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "system", content: prompt }],
            max_tokens: 500,
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error analyzing session with LLM:", error);
        return null;
    }
}


// Multer setup for file upload
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Swagger Configuration
 */
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Message Analyzer API",
            version: "1.0.0",
            description: "API for analyzing chat messages",
        },
    },
    apis: ["./index.js", "./index1.js"], // Point to this file for Swagger comments
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /upload-and-analyze:
 *   post:
 *     summary: Upload a chat text file and get analysis results.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Successfully analyzed chat history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messageCounts:
 *                   type: object
 *                 sortedTopWords:
 *                   type: object
 *                 averageResponseTime:
 *                   type: number
 *                 interestLevel:
 *                   type: object
 *                 compliments:
 *                   type: object
 *                 redFlags:
 *                   type: array
 *                 monthlyMessages:
 *                   type: object
 */
app.post("/upload-and-analyze", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "File is required" });
        }

        const chatText = file.buffer.toString("utf-8");
        const messages = parseChatText(chatText);
        const groupedSessions = groupMessagesBySession(messages);

        const messageCounts = {};
        const topWords = {};
        const compliments = {};
        const redFlags = {};
        const sessionAnalysis = [];
        const monthlyMessages = {};
        const interestLevel = {};
        const responseTimes = {};

        // Analyze each session
        for (const session of groupedSessions) {
            const sessionAnalysisResult = await analyzeSessionWithLLM(session);

            if (sessionAnalysisResult) {
                const sentimentMatch = sessionAnalysisResult.match(/Overall sentiment: (.+)/i);
                const redFlagMatch = sessionAnalysisResult.match(/Red flags: (.+)/i);
                const complimentMatch = sessionAnalysisResult.match(/Compliments: (.+)/i);
                const summaryMatch = sessionAnalysisResult.match(/Summary: (.+)/i);

                const sessionSentiment = sentimentMatch ? sentimentMatch[1].toLowerCase() : "neutral";

                // Calculate interest level based on sentiment
                session.forEach(({ sender }) => {
                    interestLevel[sender] =
                        (interestLevel[sender] || 0) +
                        (sessionSentiment === "positive" ? 2 : sessionSentiment === "neutral" ? 1 : 0);

                    if (redFlagMatch && redFlagMatch[1] !== "None") {
                        redFlags[sender] = redFlags[sender] || [];
                        redFlags[sender].push(redFlagMatch[1]);
                    }

                    if (complimentMatch && complimentMatch[1] !== "None") {
                        compliments[sender] = compliments[sender] || 0;
                        compliments[sender] += complimentMatch[1].split(", ").length;
                    }
                });

                sessionAnalysis.push({
                    session,
                    overallSentiment: sessionSentiment,
                    redFlags: redFlagMatch ? redFlagMatch[1].split(", ") : [],
                    compliments: complimentMatch ? complimentMatch[1].split(", ") : [],
                    summary: summaryMatch ? summaryMatch[1] : "No summary provided.",
                });
            }

            // Analyze individual messages
            session.forEach((currentMessage, i) => {
                const sender = currentMessage.sender;
                messageCounts[sender] = (messageCounts[sender] || 0) + 1;

                // Response time calculation
                if (i > 0 && session[i - 1].sender !== sender) {
                    const timeDiff = moment(currentMessage.timestamp).diff(
                        moment(session[i - 1].timestamp),
                        "minutes"
                    );
                    responseTimes[sender] = responseTimes[sender] || [];
                    responseTimes[sender].push(timeDiff);
                }

                // Top words calculation
                const words = stopword.removeStopwords(
                    currentMessage.message.toLowerCase().split(" "),
                    hinglishStopWords
                );
                topWords[sender] = topWords[sender] || {};
                words.forEach((word) => {
                    topWords[sender][word] = (topWords[sender][word] || 0) + 1;
                });

                // Monthly message count
                const month = moment(currentMessage.timestamp).format("MMM YYYY");
                monthlyMessages[month] = monthlyMessages[month] || { [sender]: 0 };
                monthlyMessages[month][sender] = (monthlyMessages[month][sender] || 0) + 1;
            });
        }

        // Average response time calculation
        const averageResponseTime = {};
        Object.keys(responseTimes).forEach((sender) => {
            const totalResponseTime = responseTimes[sender].reduce((a, b) => a + b, 0);
            averageResponseTime[sender] =
                totalResponseTime / (responseTimes[sender].length || 1);
        });

        const sortedTopWords = Object.fromEntries(
            Object.entries(topWords).map(([sender, words]) => [
                sender,
                Object.entries(words).sort(([, a], [, b]) => b - a).slice(0, 5),
            ])
        );

        const analysis = {
            messageCounts,
            sortedTopWords,
            averageResponseTime,
            interestLevel, // Included interest level
            compliments,
            redFlags,
            monthlyMessages,
            sessionAnalysis,
        };

        res.status(200).json({ analysis, groupedSessions });
    } catch (error) {
        console.error("Error in /upload-and-analyze:", error);
        res.status(500).json({ error: "Failed to process and analyze chat." });
    }
});



// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
    console.log(`Server is running on port ${PORT}. Visit /api-docs for Swagger UI`)
);
