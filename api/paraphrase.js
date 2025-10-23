// Paraphraser Backend: /api/paraphrase.js

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
  const { text, mode } = req.body;
  if (!text || !mode) {
    return res.status(400).json({ success: false, message: 'ERROR: Input text and mode are required.' });
  }

  // --- Gemini API Configuration ---
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  // --- Prompt ---
  // The prompt is dynamically built based on the selected mode
  const prompt = `
    You are a professional paraphrasing tool.
    Rewrite the following text to make it ${mode.toLowerCase()}.
    Do not add any commentary. Respond only with the paraphrased text.

    Original Text:
    "${text}"

    Paraphrased Text:
  `;

  // --- Payload ---
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    // No tools or JSON schema needed, we just want the raw text response
  };

  // --- Retry Configuration ---
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000;

  // --- API Call with Timeout and Retry Logic ---
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      console.log(`SERVER LOG (Paraphrase): API request attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);
      
      try {
        const apiResponse = await fetch(geminiApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        console.log(`SERVER LOG (Paraphrase): Attempt ${attempt + 1} status:`, apiResponse.status);

        if (apiResponse.ok) {
          const result = await apiResponse.json();
          const candidate = result?.candidates?.[0];
          const part = candidate?.content?.parts?.[0];
          
          if (!part?.text) {
            console.error("SERVER ERROR (Paraphrase): Unexpected Gemini response structure.", JSON.stringify(result, null, 2));
            let reason = 'Unexpected or empty response structure from AI.';
            if (candidate?.finishReason === 'SAFETY') reason = 'AI response blocked due to safety settings.';
            throw new Error(reason);
          }

          const paraphrasedText = part.text.trim();
          console.log("SERVER LOG (Paraphrase): Successfully received paraphrased text.");
          
          return res.status(200).json({ success: true, paraphrasedText: paraphrasedText });
        }

        if (apiResponse.status === 503) {
          if (attempt === MAX_RETRIES) {
            throw new Error('The model is overloaded. Please try again later. (Max retries reached)');
          }
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`SERVER LOG (Paraphrase): Model overloaded (503). Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        let errorBody = `Gemini API Error: ${apiResponse.status} ${apiResponse.statusText}`;
        try {
          const errorJson = await apiResponse.json();
          console.error("SERVER ERROR (Paraphrase): Gemini API returned non-retryable error JSON:", errorJson);
          errorBody = errorJson?.error?.message || errorBody;
        } catch (e) {
          console.error("SERVER ERROR (Paraphrase): Gemini API returned non-JSON error response.");
        }
        throw new Error(errorBody);

      } catch (fetchError) {
        console.error(`SERVER LOG (Paraphrase Attempt ${attempt + 1}):`, fetchError.message);
        if (attempt === MAX_RETRIES) {
          throw fetchError; // Give up
        }
        
        const errorString = fetchError.message || "";
        if (errorString.includes('Failed to fetch') || errorString.includes('network error')) {
            const delay = BASE_DELAY * Math.pow(2, attempt);
            console.log(`SERVER LOG (Paraphrase): Network error. Retrying in ${delay}ms...`);
            await sleep(delay);
        } else {
            throw fetchError;
        }
      }
    }

  } catch (error) {
    let errorMessage = 'ERROR: The AI service encountered an issue processing the request.';
    let serverLogMessage = `Vercel Function Error (Paraphrase Check): ${error.message}`;

    if (error.name === 'AbortError') {
        serverLogMessage = "Vercel Function Error (Paraphrase): Request timed out.";
        errorMessage = 'ERROR: The paraphrasing analysis took too long. Please try again.';
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
