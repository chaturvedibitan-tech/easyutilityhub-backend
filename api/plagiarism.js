// Plagiarism Checker Backend: /api/plagiarism.js

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
    console.error('SERVER ERROR: Gemini API key not configured.');
    return res.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // --- Input Validation ---
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, message: 'ERROR: Input text is required.' });
  }

  // --- Gemini API Configuration ---
  // Using the same model as your grammar checker for consistency
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  // --- Prompt ---
  const prompt = `
    You are a plagiarism checker. Analyze the following text.
    Use your Google Search tool to find online sources that substantially match this text.

    Text: "${text}"

    After searching, provide:
    1.  A "plagiarismPercentage" (number from 0-100) representing how much of the text is found in online sources.
    2.  A "uniquePercentage" (number from 0-100) for the remaining text.
    3.  A "matchedSources" array. For each source found, include its "title", "url", and a "snippet" of the matching text.

    If no plagiarism is found, return 0 for plagiarismPercentage, 100 for uniquePercentage, and an empty matchedSources array.
    Respond ONLY with a single valid JSON object adhering strictly to the schema. Do not include any markdown.
  `;

  // --- Payload with Schema ---
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    // --- THIS IS THE KEY ---
    // Enable Google Search grounding
    tools: [{ "google_search": {} }],
    // ------------------------
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "plagiarismPercentage": { type: "NUMBER" },
          "uniquePercentage": { type: "NUMBER" },
          "matchedSources": {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "title": { type: "STRING" },
                "url": { type: "STRING" },
                "snippet": { type: "STRING" }
              },
              required: ["title", "url", "snippet"]
            }
          }
        },
        required: ["plagiarismPercentage", "uniquePercentage", "matchedSources"]
      }
    }
  };

  // --- Retry Configuration ---
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000;

  // --- API Call with Timeout and Retry Logic ---
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      console.log(`SERVER LOG (Plagiarism): API request attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);
      
      try {
        const apiResponse = await fetch(geminiApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        console.log(`SERVER LOG (Plagiarism): Attempt ${attempt + 1} status:`, apiResponse.status);

        if (apiResponse.ok) {
          const result = await apiResponse.json();
          const candidate = result?.candidates?.[0];
          const part = candidate?.content?.parts?.[0];
          
          if (!part?.text) {
            console.error("SERVER ERROR (Plagiarism): Unexpected Gemini response structure.", JSON.stringify(result, null, 2));
            let reason = 'Unexpected or empty response structure from AI.';
            if (candidate?.finishReason === 'SAFETY') reason = 'AI response blocked due to safety settings.';
            if (candidate?.finishReason === 'RECITATION') reason = 'AI response blocked due to potential recitation.';
            throw new Error(reason);
          }

          const jsonText = part.text;
          console.log("SERVER LOG (Plagiarism): Received JSON text from Gemini.");
          const data = JSON.parse(jsonText);
          console.log("SERVER LOG (Plagiarism): Successfully parsed JSON data.");
          
          return res.status(200).json({ success: true, ...data });
        }

        if (apiResponse.status === 503) {
          if (attempt === MAX_RETRIES) {
            throw new Error('The model is overloaded. Please try again later. (Max retries reached)');
          }
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`SERVER LOG (Plagiarism): Model overloaded (503). Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        let errorBody = `Gemini API Error: ${apiResponse.status} ${apiResponse.statusText}`;
        try {
          const errorJson = await apiResponse.json();
          console.error("SERVER ERROR (Plagiarism): Gemini API returned non-retryable error JSON:", errorJson);
          errorBody = errorJson?.error?.message || errorBody;
        } catch (e) {
          console.error("SERVER ERROR (Plagiarism): Gemini API returned non-JSON error response.");
        }
        throw new Error(errorBody);

      } catch (fetchError) {
        console.error(`SERVER ERROR (Plagiarism Attempt ${attempt + 1}):`, fetchError.message);
        if (attempt === MAX_RETRIES) {
          throw fetchError;
        }
        if (!String(fetchError.message).includes('503') && !String(fetchError.message).includes('overloaded')) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`SERVER LOG (Plagiarism): Network error. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

  } catch (error) {
    let errorMessage = 'ERROR: The AI service encountered an issue processing the request.';
    let serverLogMessage = `Vercel Function Error (Plagiarism Check): ${error.message}`;

    if (error.name === 'AbortError') {
        serverLogMessage = "Vercel Function Error (Plagiarism): Request timed out.";
        errorMessage = 'ERROR: The plagiarism analysis took too long. Please try again.';
    } else if (error.message.includes('overloaded')) {
        errorMessage = 'ERROR: The model is overloaded. Please try again later.';
    } else if (error.message.includes('Gemini API Error:')) {
        errorMessage = `ERROR: ${error.message}`;
    } else if (error instanceof SyntaxError) {
        serverLogMessage = `VLC Function Error (Plagiarism): Failed to parse JSON response from AI. ${error.message}`;
        errorMessage = 'ERROR: Received an invalid response format from the AI.';
    }

    console.error(serverLogMessage);
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

// Wrap the handler with CORS
export default allowCors(handler);
