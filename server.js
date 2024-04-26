const express = require('express');
const { createWriteStream } = require('fs');
const PlayHTAPI = require('playht');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const path = require('path'); // Import path module

const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables from .env file
dotenv.config();

// Initialize PlayHTAPI
PlayHTAPI.init({
  apiKey: process.env.PLAYHT_API_KEY,
  userId: process.env.PLAYHT_USER_ID,
});

// Middleware to parse JSON bodies
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send("Hello");
});

app.post('/t2s', async (req, res) => {
    const { text } = req.body;
    console.log(text);
    const sentences=[];
    sentences.push(text);
    try {
        // Warm up the network caching
        let warmupStream = await PlayHTAPI.stream("b", {
            voiceId: "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json",
        });

        warmupStream.once("data", async () => {
            const TTFBs = []; // Array to store TTFB for each sentence

            const streamAudio = async () => {
                const grpcFileStream = createWriteStream("hello-play.mp3", {
                    flags: "w", // This ensures that each stream result is appended to the file
                });

                for (let [i, sentence] of sentences.entries()) {
                    const startTime = Date.now(); // Start the timer

                    const grpcStream = await PlayHTAPI.stream(sentence, {
                        voiceId: "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json",
                        outputFormat: 'mp3', // 'mulaw'
                        quality: 'premium', // 'premium'
                        speed: 1,
                        textGuidance: 2.0,
                        voiceEngine: 'PlayHT2.0'
                    });

                    let chunkCounter = 0;
                    let firstChunkReceived = false;
                    grpcStream.on("data", (chunk) => {
                        chunkCounter += 1;
                        if (chunkCounter === 2 && !firstChunkReceived) {
                            const TTFB = Date.now() - startTime; // Calculate TTFB
                            console.log(`TTFB for sentence ${i}: ${TTFB}ms`);
                            TTFBs.push(TTFB); // Store the TTFB in the array
                            firstChunkReceived = true;
                        }
                        grpcFileStream.write(chunk);
                    });

                    await new Promise((resolve, reject) => {
                        grpcStream.on("end", resolve);
                        grpcStream.on("error", reject);
                    });
                }

                grpcFileStream.end();

                // Calculate average TTFB
                const avgTTFB = TTFBs.reduce((sum, value) => sum + value, 0) / TTFBs.length;

                // Calculate median TTFB
                const sortedTTFBs = [...TTFBs].sort((a, b) => a - b);
                const mid = Math.floor(sortedTTFBs.length / 2);
                const medianTTFB =
                    sortedTTFBs.length % 2 === 0
                        ? (sortedTTFBs[mid - 1] + sortedTTFBs[mid]) / 2
                        : sortedTTFBs[mid];

                console.log(`Average TTFB: ${avgTTFB.toFixed(2)}ms`);
                console.log(`Median TTFB: ${medianTTFB}ms`);

                // Send the .mp3 file back to the client
                res.sendFile(path.join(__dirname, "hello-play.mp3")); // Use path.join to get the full path to the file
            };

            await streamAudio();
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log('Server running on PORT', PORT);
});
