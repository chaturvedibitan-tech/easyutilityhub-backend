// AI Humanizer Backend: /api/humanizer.js

// Helper function for delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// CORS Helper Function
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// Main Handler Function
async function handler(req, res) {
  // --- Secure API Key Retrieval ---
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('SERVER ERROR (Humanizer): Gemini API key not configured.');
    return res.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // --- Input Validation ---
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, message: 'ERROR: Input text is required.' });
  }

  // --- Gemini API Configuration ---
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // --- Prompt ---
  const prompt = `
    You are a creative editor. Your task is to rewrite the following AI-generated text to sound like it was written by a human.
    Focus on:
    1.  **Burstiness:** Vary sentence length and structure. Mix short, punchy sentences with longer, more complex ones.
    2.  **Vocabulary:** Replace overly formal or complex words with more natural, common language.
    3.  **Personality:** Add a more personal or slightly informal tone.
    4.  **Flow:** Break up long, uniform paragraphs.

    Original Text:
    "${text}"

    Rewrite the text to be more engaging and less robotic. Respond ONLY with a single valid JSON object adhering to the schema.
  `;

  // --- Payload with Schema ---
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "humanizedText": {
            type: "STRING",
            description: "The rewritten, human-sounding text."
          }
        },
        required: ["humanizedText"]
      }
    }
  };

  // --- Retry Configuration ---
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000;

  // --- API Call with Timeout and Retry Logic ---
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      console.log(`SERVER LOG (Humanizer): API request attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);
      
      try {
        const apiResponse = await fetch(geminiApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        console.log(`SERVER LOG (Humanizer): Attempt ${attempt + 1} status:`, apiResponse.status);

        if (apiResponse.ok) {
          const result = await apiResponse.json();
          const candidate = result?.candidates?.[0];
          const part = candidate?.content?.parts?.[0];
          
          if (!part?.text) {
            console.error("SERVER ERROR (Humanizer): Unexpected Gemini response structure.", JSON.stringify(result, null, 2));
            let reason = 'Unexpected or empty response structure from AI.';
            if (candidate?.finishReason === 'RECITATION') {
                reason = 'AI response blocked due to potential recitation.';
            } else if (candidate?.finishReason === 'SAFETY') {
                reason = 'AI response blocked due to safety settings.';
            }
            throw new Error(reason);
          }

          const jsonText = part.text;
          console.log("SERVER LOG (Humanizer): Received JSON text from Gemini.");

          const data = JSON.parse(jsonText);
          console.log("SERVER LOG (Humanizer): Successfully parsed JSON data.");

          // Send the successful data back
          return res.status(200).json({ success: true, ...data });
        }

        if (apiResponse.status === 503) {
          if (attempt === MAX_RETRIES) {
            throw new Error('The model is overloaded. Please try again later. (Max retries reached)');
          }
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`SERVER LOG (Humanizer): Model overloaded (503). Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        
        // Handle other non-OK responses (400, 500, etc.)
        let errorBody = `Gemini API Error: ${apiResponse.status} ${apiResponse.statusText}`;
        try {
          const errorJson = await apiResponse.json();
          console.error("SERVER ERROR (Humanizer): Gemini API returned non-retryable error JSON:", errorJson);
          errorBody = errorJson?.error?.message || errorBody;
        } catch (e) {
          console.error("SERVER ERROR (Humanizer): Gemini API returned non-JSON error response.");
        }
        throw new Error(errorBody);

      } catch (fetchError) {
        console.error(`SERVER LOG (Humanizer Attempt ${attempt + 1}):`, fetchError.message);
        
        // Do not retry on permanent errors
        if (fetchError.message.includes('Gemini API Error') || fetchError.message.includes('safety') || fetchError.message.includes('recitation')) {
             throw fetchError;
        }

        if (attempt === MAX_RETRIES) {
          throw fetchError; // Give up on max retries
        }
        
        // Retry on network errors or 503s
        const delay = BASE_DELAY * Math.pow(2, attempt);
        console.log(`SERVER LOG (Humanizer): Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  } catch (error) {
    let errorMessage = 'ERROR: The AI service encountered an issue processing the request.';
    let serverLogMessage = `Vercel Function Error (AI Humanizer): ${error.message}`;

    if (error.name === 'AbortError') {
        serverLogMessage = "Vercel Function Error (AI Humanizer): Request timed out.";
        errorMessage = 'ERROR: The analysis took too long. Please try again.';
    } else if (error.message.includes('overloaded')) {
        errorMessage = 'ERROR: The model is overloaded. Please try again later.';
    } else if (error.message.includes('Gemini API Error:')) {
        errorMessage = `ERROR: ${error.message}`;
    }

    console.error(serverLogMessage);
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

// Wrap the handler with CORS
export default allowCors(handler);

