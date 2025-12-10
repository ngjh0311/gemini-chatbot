/* This script is used to perform server-side functionality needed for the application. */

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const upload = multer();
const app = express();
const port = process.env.PORT || 3000;

// IMPORTANT: Middleware to parse JSON bodies - must come BEFORE routes
app.use(express.json());

// CORS middleware for all routes
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://127.0.0.1:5500");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Test endpoint to verify server is running
app.get('/', (req, res) => {
    res.json({ message: 'Gemini API Server is running' });
});

app.get('/api/config', (req, res) => {
    res.json({ API_KEY: process.env.API_KEY });
});

// POST endpoint for Gemini API proxy
// Accept either JSON body or multipart/form-data with an 'image' file field
app.post('/api/gemini', upload.single('image'), async (req, res) => {
    console.log('Received request to /api/gemini');

    try {
        const prompt = req.body && req.body.prompt;
        const file = req.file; // present when multipart/form-data used

        // If an image was uploaded, send to Gemini's multimodal API
        if (file) {
            console.log('Received image upload:', file.originalname);
            console.log('File buffer size:', file.size, 'bytes');
            
            // Convert image buffer to base64
            const base64Image = file.buffer.toString('base64');
            const mimeType = file.mimetype || 'image/jpeg'; // Default to jpeg if mimetype not detected
            
            const API_KEY = process.env.API_KEY;
            if (!API_KEY) {
                return res.status(500).json({ error: 'API_KEY not configured in .env file' });
            }

            // Build multimodal request to Gemini API
            const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
            
            const multimodalRequest = {
                contents: [
                    {
                        parts: [
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64Image
                                }
                            },
                            {
                                text: prompt || 'What is in this image? Describe it in detail.'
                            }
                        ]
                    }
                ]
            };

            console.log('Sending multimodal request to Gemini API...');

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(multimodalRequest)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API error:', errorData);
                return res.status(response.status).json({ error: 'Gemini API request failed', details: errorData });
            }

            const responseData = await response.json();
            console.log('Gemini multimodal response received successfully');
            return res.json(responseData);
        }

        // Fallback: handle text-only requests (existing behavior)
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required when no image is uploaded' });
        }

        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            return res.status(500).json({ error: 'API_KEY not configured in .env file' });
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
        const data = { contents: [ { parts: [{ text: prompt }] } ] };

        console.log('Sending request to Gemini API...');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API error:', errorData);
            return res.status(response.status).json({ error: 'Gemini API request failed', details: errorData });
        }

        const responseData = await response.json();
        console.log('Gemini API response received successfully');
        res.json(responseData);

    } catch (error) {
        console.error('Error in /api/gemini:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://127.0.0.1:${port}`);
    console.log('Available endpoints:');
    console.log(`  GET  http://127.0.0.1:${port}/`);
    console.log(`  GET  http://127.0.0.1:${port}/api/config`);
    console.log(`  POST http://127.0.0.1:${port}/api/gemini`);
});