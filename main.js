const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const moment = require("moment");
const stopword = require("stopword");
const { Configuration, OpenAIApi } = require("openai");
const { HfInference } = require("@huggingface/inference");

require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// OpenAI API and Hugging Face Inference
const openai = new OpenAIApi(
    new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);
const hf = new HfInference(process.env.HF_API_KEY);

// MongoDB Connection
const mongoURI = "your_mongodb_uri";

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
    "aur", "lekin", "hai", "ka", "ki", "ke", "mein", "ko", "se", "hi", "bhi",
];

// Function: Parse Chat Text
function parseChatText(chatText) {
    const lines = chatText.split("\n");
    const messages = [];
    const regex = /^\[(\d{2}\/\d{2}\/\d{4}), (\d{1,2}:\d{2} (AM|PM))\] (.+?): (.+)$/;

    lines.forEach((line) => {
        const match = line.match(regex);
        if (match) {
            const [, date, time, , sender, message] = match;
            const timestamp = moment(`${date} ${time}`, "MM/DD/YYYY hh:mm A").toDate();
            messages.push({ sender, message, timestamp });
        }
    });

    return messages;
}

// Function: Analyze with LLM (OpenAI)
async function analyzeWithLLM(message) {
    try {
        const prompt = `Analyze the following Hinglish message:
      "${message}" and provide:
      1. Sentiment (Positive, Negative, Neutral, Lovable, Annoying, Avoiding).
      2. Whether it contains any red flags (if yes, list them).
      3. Whether it contains compliments (if yes, list them).
      4. Attachment style (Anxious, Avoidant, Secure, or Unknown).`;

        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt,
            max_tokens: 150,
        });

        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error("Error with LLM analysis:", error);
        return null;
    }
}

// Function: Analyze Message with Hugging Face
async function analyzeMessageWithHuggingFace(message) {
    try {
        const result = await hf.textClassification({
            model: "nlptown/bert-base-multilingual-uncased-sentiment",
            inputs: message,
        });
        return result;
    } catch (error) {
        console.error("Error with Hugging Face analysis:", error);
        return null;
    }
}

// Function: Calculate Response Times
function calculateResponseTimes(messages) {
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
    return { responseTimes, averageResponseTime };
}

// Function: Extract Top Words
function extractTopWords(messages) {
    const topWords = {};
    messages.forEach(({ sender, message }) => {
        const words = stopword.removeStopwords(
            message.toLowerCase().split(" "),
            hinglishStopWords
        );
        topWords[sender] = topWords[sender] || {};
        words.forEach((word) => {
            topWords[sender][word] = (topWords[sender][word] || 0) + 1;
        });
    });

    return Object.fromEntries(
        Object.entries(topWords).map(([sender, words]) => [
            sender,
            Object.entries(words).sort(([, a], [, b]) => b - a).slice(0, 5),
        ])
    );
}

// Routes
app.get("/", (req, res) => {
    res.send("Welcome to the Message Analyzer API!");
});

// Upload and Analyze Endpoint
app.post("/upload-and-analyze", async (req, res) => {
    try {
        const chatText = req.body.chatText;

        if (!chatText) {
            return res.status(400).json({ error: "Chat text is required" });
        }

        const messages = parseChatText(chatText);

        // Save to database (optional)
        try {
            await Message.insertMany(messages);
        } catch (dbError) {
            console.error("Error saving messages to database:", dbError);
        }

        // Perform analysis
        const messageCounts = messages.reduce((acc, msg) => {
            acc[msg.sender] = (acc[msg.sender] || 0) + 1;
            return acc;
        }, {});

        const sortedTopWords = extractTopWords(messages);
        const { averageResponseTime } = calculateResponseTimes(messages);

        const interestLevel = {};
        const compliments = {};
        const redFlags = [];
        const monthlyMessages = {};

        for (const { sender, message, timestamp } of messages) {
            const llmAnalysis = await analyzeWithLLM(message);

            if (llmAnalysis) {
                const sentimentMatch = llmAnalysis.match(/Sentiment: (.+)/i);
                const redFlagMatch = llmAnalysis.match(/Red flags: (.+)/i);
                const complimentMatch = llmAnalysis.match(/Compliments: (.+)/i);
                const attachmentMatch = llmAnalysis.match(/Attachment style: (.+)/i);

                if (sentimentMatch) {
                    const sentiment = sentimentMatch[1].toLowerCase();
                    interestLevel[sender] =
                        (interestLevel[sender] || 0) +
                        (sentiment === "positive" ? 2 : sentiment === "neutral" ? 1 : 0);
                }

                if (redFlagMatch) {
                    const detectedFlags = redFlagMatch[1];
                    if (detectedFlags && detectedFlags !== "None") {
                        redFlags.push({ sender, message, detectedFlags });
                    }
                }

                if (complimentMatch) {
                    const detectedCompliments = complimentMatch[1].split(", ");
                    compliments[sender] =
                        (compliments[sender] || 0) + detectedCompliments.length;
                }

                if (attachmentMatch) {
                    const attachmentStyle = attachmentMatch[1];
                    console.log(`Detected attachment style for ${sender}: ${attachmentStyle}`);
                }
            }

            const month = moment(timestamp).format("MMM YYYY");
            monthlyMessages[month] = monthlyMessages[month] || { [sender]: 0 };
            monthlyMessages[month][sender] =
                (monthlyMessages[month][sender] || 0) + 1;
        }

        // Response Object
        const analysis = {
            messageCounts,
            sortedTopWords,
            averageResponseTime,
            interestLevel,
            compliments,
            redFlags,
            monthlyMessages,
        };

        res.status(200).json(analysis);
    } catch (error) {
        console.error("Error in /upload-and-analyze:", error);
        res.status(500).json({ error: "Failed to process and analyze chat." });
    }
});

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));