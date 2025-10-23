// Plagiarism Backend: /api/plagiarism.js
// FIX: Updated prompt to avoid "RECITATION" error.

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
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  // --- ** NEW, More Explicit Prompt ** ---
  const prompt = `
    You are a professional plagiarism detection service.
    Your task is to analyze the following user-provided text using your Google Search tool to find matching sources.
    
    User Text:
    "${text}"

    Your Instructions:
    1.  Search Google for snippets from the User Text.
    2.  Based on the search results, determine a "plagiarismPercentage" (number, 0-100) and a "uniquePercentage" (number, 0-100).
    3.  Compile a list of "matchedSources".
    4.  For each source in "matchedSources", provide its "url", "title", and a "snippet".
    5.  The "snippet" MUST be a *short quote* from the user's text that matches the source, NOT a quote from the source itself.
    
    IMPORTANT: Your final response MUST be a single, valid JSON object. Do NOT include markdown \`\`\`json.
    Do NOT recite or output the full User Text in your response. Your response must be an *analysis* in the specified JSON format.

    JSON Schema:
    {
      "plagiarismPercentage": number,
      "uniquePercentage": number,
      "matchedSources": [
        {
          "url": "string",
          "title": "string",
          "snippet": "string"
        }
      ]
    }

    If no matches are found, return 0 for plagiarismPercentage, 100 for uniquePercentage, and an empty matchedSources array.
  `;

  // --- Payload ---
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ "google_search": {} }],
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
            // ** This logic correctly catches the RECITATION error **
            if (candidate?.finishReason === 'RECITATION') {
                reason = 'AI response blocked due to potential recitation.';
            } else if (candidate?.finishReason === 'SAFETY') {
                reason = 'AI response blocked due to safety settings.';
            }
            throw new Error(reason);
          }

          let jsonText = part.text.trim();
          console.log("SERVER LOG (Plagiarism): Received raw text from Gemini.");

          // Clean markdown backticks
          if (jsonText.startsWith("```json")) {
            jsonText = jsonText.substring(7, jsonText.length - 3).trim();
          } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.substring(3, jsonText.length - 3).trim();
          }
          
          console.log("SERVER LOG (Plagiarism): Cleaned text. Attempting to parse...");
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
        // Do not retry on 400-level errors
        throw new Error(errorBody);

      } catch (fetchError) {
        console.error(`SERVER LOG (Plagiarism Attempt ${attempt + 1}):`, fetchError.message);
        const errorString = (fetchError.message || "").toLowerCase();
        
        // ** FIX: Do NOT retry on RECITATION or other permanent errors **
        if (errorString.includes('recitation') || errorString.includes('safety') || errorString.includes('invalid') || errorString.includes('gemini api error')) {
             throw fetchError; // Give up immediately
        }

        if (attempt === MAX_RETRIES) {
          throw fetchError; // Give up on max retries
        }
        
        // Retry on network errors or 503s
        const delay = BASE_DELAY * Math.pow(2, attempt);
        console.log(`SERVER LOG (Plagiarism): Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }

  } catch (error) {
    let errorMessage = 'ERROR: The AI service encountered an issue processing the request.';
    let serverLogMessage = `Vercel Function Error (Plagiarism Check): ${error.message}`;

    if (error.name === 'AbortError') {
        serverLogMessage = "Vercel Function Error (Paraphrase): Request timed out.";
        errorMessage = 'ERROR: The analysis took too long. Please try again.';
    } else if (error.message.includes('overloaded')) {
        errorMessage = 'ERROR: The model is overloaded. Please try again later.';
    } else if (error.message.includes('recitation')) {
         errorMessage = 'ERROR: AI analysis was blocked. The text may be too similar to a web source.';
    } else if (error.message.includes('Gemini API Error:')) {
        errorMessage = `ERROR: ${error.message}`;
    }

    console.error(serverLogMessage);
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

// Wrap the handler with CORS
export default allowCors(handler);

