### **README: Message Analyzer Backend**

---

#### **Project Overview**

The **Message Analyzer** is a backend application that processes chat history to derive meaningful insights using NLP techniques and LLM (Large Language Model) integration. It analyzes messages for:

1. **Message Count per Person**
2. **Top Words Used by Each Person**
3. **Average Response Time**
4. **Sentiment Analysis**
5. **Red Flag Detection**
6. **Compliments Detection**
7. **Monthly Message Distribution**

---

### **Plan: How We Proceeded**

1. **Basic Backend Setup** :

* Used **Express.js** as the backend framework.
* Connected to **MongoDB** using **Mongoose** for data persistence.
* Added middleware for CORS and JSON body parsing.

1. **Chat History Parsing** :

* Implemented a `parseChatText` function to parse raw chat history into a structured format.
* Extracted sender, message, and timestamp using a regex.

1. **LLM Integration** :

* Integrated **OpenAI GPT (text-davinci-003)** for:
  * Sentiment analysis.
  * Red flag detection.
  * Compliment detection.
* Optionally, **Hugging Face API** was set up for local or alternative sentiment analysis.

1. **Insights Generation** :

* Calculated:
  * Message counts per person.
  * Top words per person using **stopword** for filtering.
  * Average response time between messages.
  * Monthly message trends.

---

### **Plan: How We Will Proceed**

1. **Optimize LLM Usage** :

* Refactor the `analyzeWithLLM` function to batch-process messages for efficiency.
* Add support for fine-tuned models if needed (e.g., specific to Hinglish or multilingual data).

1. **Frontend Integration** :

* Create endpoints for:
  * Fetching stored chat histories.
  * Re-running analysis on selected histories.
* Develop a React-based frontend for uploading files and viewing insights.

1. **Error Handling** :

* Improve error handling for LLM requests and MongoDB operations.
* Add detailed error codes and logging for easier debugging.

1. **Testing and Deployment** :

* Write unit tests for parsing and analysis functions.
* Deploy on platforms like **Render** or **AWS EC2** for backend hosting.

---

### **How to Use**

#### **Endpoints**

1. **Root Endpoint**

   ```
   GET /
   ```

   * **Description** : Welcome message to confirm server is running.
2. **Upload Chat History**

   ```
   POST /upload
   ```

   * **Description** : Uploads a raw chat history (plain text).
   * **Body** :

   ```json
   {
     "chatText": "String of chat text here"
   }
   ```

   * **Response** :

   ```json
   {
     "message": "Chat history uploaded successfully!"
   }
   ```
3. **Analyze Chat Data**

   ```
   POST /analyze
   ```

   * **Description** : Analyzes structured chat data for insights.
   * **Body** :

   ```json
   {
     "messages": [
       {
         "sender": "Alice",
         "message": "Hi, how are you?",
         "timestamp": "2025-01-27T10:00:00.000Z"
       },
       {
         "sender": "Bob",
         "message": "I'm fine, thank you!",
         "timestamp": "2025-01-27T10:01:00.000Z"
       }
     ]
   }
   ```

   * **Response** :

   ```json
   {
     "messageCounts": {
       "Alice": 1,
       "Bob": 1
     },
     "sortedTopWords": {
       "Alice": [["hi", 1], ["how", 1], ["are", 1], ["you", 1]],
       "Bob": [["fine", 1], ["thank", 1], ["you", 1]]
     },
     "averageResponseTime": 1,
     "interestLevel": {
       "Alice": 2,
       "Bob": 1
     },
     "compliments": {
       "Alice": 0,
       "Bob": 1
     },
     "redFlags": [],
     "monthlyMessages": {
       "Jan 2025": {
         "Alice": 1,
         "Bob": 1
       }
     }
   }
   ```

1. **Endpoint** :

```
   POST /upload-and-analyze
```

1. **Request Body** :

```json
   {
     "chatText": "Your raw chat history in plain text format"
   }
```

1. **Response** :

```json
   {
     "messageCounts": { "Alice": 10, "Bob": 15 },
     "sortedTopWords": {
       "Alice": [["hello", 5], ["how", 3], ["you", 2]],
       "Bob": [["work", 6], ["okay", 4], ["thanks", 3]]
     },
     "averageResponseTime": 2.5,
     "interestLevel": { "Alice": 10, "Bob": 8 },
     "compliments": { "Alice": 3, "Bob": 5 },
     "redFlags": [
       { "sender": "Bob", "message": "I hate this!", "detectedFlags": "hate" }
     ],
     "monthlyMessages": {
       "Jan 2025": { "Alice": 5, "Bob": 7 },
       "Feb 2025": { "Alice": 5, "Bob": 8 }
     }
   }
```

---

### **Suggestions**

1. **Timeout Handling** :

* For long chat histories, processing may take time. Add a timeout mechanism or indicate progress to the user on the frontend.

1. **Asynchronous DB Save** :

* Save parsed chat data to the database asynchronously to reduce response time.

1. **Optional Storage** :

* Allow users to opt out of storing chat data in the database if privacy is a concern.

1. **Batch LLM Processing** :

* Optimize LLM calls by batching multiple messages into one prompt to improve speed and reduce costs.

1. **Batch Processing** :

* Currently, the LLM is called for each message. Batch multiple messages in a single API call to reduce latency and costs.

1. **Custom Model Fine-Tuning** :

* Fine-tune an open-source model (like LLaMA) on Hinglish datasets to improve sentiment and red flag detection accuracy.

1. **UI Improvements** :

* Add file upload support on the frontend for seamless chat history uploads.
* Display visual graphs for monthly messages and other insights.

1. **Enhanced NLP** :

* Integrate **Hugging Face Transformers.js** for running local models without API dependencies.

1. **Real-Time Analysis** :

* Add WebSocket support for live chat analysis as messages are sent.
