/*
 * Vercel Serverless Function: api/grammar.js
 *
 * This function acts as a secure proxy to the Google Gemini API.
 * It receives text from the frontend, constructs a precise prompt,
 * and uses Gemini's JSON mode to get structured correction data.
 *
 * Deployment: Place this file in the /api directory of your Vercel project.
 * Environment Variable: Set 'GEMINI_API_KEY' in your Vercel project settings.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuration ---

// Use 'gemini-1.5-flash-latest' for a balance of speed and capability.
const MODEL_NAME = 'gemini-1.5-flash-latest';
const API_KEY = process.env.GEMINI_API_KEY;

// Initialize the Gemini client
let genAI;
let model;
try {
  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    // System instruction to guide the AI's behavior
    systemInstruction: `You are an expert proofreader and writing coach.
Analyze the user's text for errors in spelling, grammar, and style (e.g., wordiness, passive voice, awkward phrasing).
You must provide corrections in the exact JSON format specified.
Character indices (from/to) MUST be precise and based on the original plain text.
'from' is the 0-based index of the first character of the error.
'to' is the 0-based index of the character *after* the last character of the error.
Also provide an overall 'tone' (e.g., "Formal", "Casual", "Assertive") and a 'clarityScore' (0-100).
If no errors are found, return an empty 'corrections' array.`,
  });
} catch (e) {
  console.error('Failed to initialize GoogleGenerativeAI. Is GEMINI_API_KEY set?', e.message);
}

// --- AI JSON Schema ---

// This schema forces Gemini to return JSON in our required format.
const responseSchema = {
  type: 'OBJECT',
  properties: {
    success: { type: 'BOOLEAN' },
    analysis: {
      type: 'OBJECT',
      properties: {
        tone: { type: 'STRING' },
        clarityScore: { type: 'NUMBER' },
      },
      required: ['tone', 'clarityScore'],
    },
    corrections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          from: { type: 'NUMBER' },
          to: { type: 'NUMBER' },
          mistake: { type: 'STRING' },
          correction: { type: 'STRING' },
          type: {
            type: 'STRING',
            enum: ['Spelling', 'Grammar', 'Style'],
          },
        },
        required: ['from', 'to', 'mistake', 'correction', 'type'],
      },
    },
  },
  required: ['success', 'analysis', 'corrections'],
};

// --- Vercel Handler Function ---

export default async function handler(request, response) {
  // --- CORS Headers ---
  // Allow requests from any origin. For production, you might restrict this
  // to your website's domain (e.g., 'https://easyutilityhub.com').
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // --- POST Request Logic ---
  if (request.method === 'POST') {
    if (!model) {
      console.error('Gemini model not initialized.');
      return response.status(500).json({
        success: false,
        message: 'Server error: AI model not initialized.',
      });
    }

    try {
      const { text } = request.body;

      if (typeof text !== 'string') {
        return response.status(400).json({
          success: false,
          message: 'Invalid request: "text" field is missing or not a string.',
        });
      }

      // If text is empty, return success with no corrections
      if (text.trim() === '') {
        return response.status(200).json({
          success: true,
          analysis: { tone: 'N/A', clarityScore: 100 },
          corrections: [],
        });
      }

      // --- Call Gemini API ---
      const chat = model.startChat({
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.2, // Lower temperature for more deterministic corrections
        },
      });

      const prompt = `Please analyze the following text:\n\n${text}`;
      const result = await chat.sendMessage(prompt);
      const aiResponse = result.response;

      // The response.text() will be a stringified JSON object
      const jsonData = JSON.parse(aiResponse.text());
      
      // Send the structured JSON data back to the frontend
      return response.status(200).json(jsonData);

    } catch (error) {
      console.error('Error calling Gemini API:', error);
      let errorMessage = 'An error occurred while processing your request.';
      if (error.message) {
        errorMessage = error.message;
      }
      return response.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }

  // --- Handle other methods ---
  response.setHeader('Allow', ['POST', 'OPTIONS']);
  return response.status(405).json({
    success: false,
    message: `Method ${request.method} Not Allowed`,
  });
}
