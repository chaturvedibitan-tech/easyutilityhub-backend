// Final Robust grammar.js with Exponential Backoff

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
    console.error('SERVER ERROR: Gemini API key not configured.'); // Detailed server log
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
    Analyze the following text meticulously for spelling, grammar, and style errors. Provide an overall tone (e.g., Formal, Informal, Confident) and a clarity score (0-100).
    Text: "${text}"
    Respond ONLY with a single valid JSON object adhering strictly to the provided schema. Do not include any markdown formatting (like \`\`\`json). The indices 'from' and 'to' must be precise character counts from the start of the original text. If no errors are found, return an empty "corrections" array.
  `;

  // --- Payload with Schema ---
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "analysis": {
            type: "OBJECT",
            properties: { "tone": { type: "STRING" }, "clarityScore": { type: "NUMBER" } },
            required: ["tone", "clarityScore"]
          },
          "corrections": {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { "from": { type: "NUMBER" }, "to": { type: "NUMBER" }, "mistake": { type: "STRING" }, "correction": { type: "STRING" }, "type": { type: "STRING", enum: ["Spelling", "Grammar", "Style"]} },
              required: ["from", "to", "mistake", "correction", "type"]
            }
          }
        },
        required: ["analysis", "corrections"]
      }
    }
  };

  // --- NEW: Retry Configuration ---
  const MAX_RETRIES = 3; // Total 4 attempts (1 initial + 3 retries)
  const BASE_DELAY = 1000; // 1 second

  // --- API Call with Timeout and Retry Logic ---
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      console.log(`SERVER LOG: Gemini API request attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);
      
      try {
        const apiResponse = await fetch(geminiApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          // We removed the 9.5s AbortController to let Vercel's (longer) timeout rule.
          // You MUST increase the function's maxDuration in vercel.json
        });
        
        console.log(`SERVER LOG: Attempt ${attempt + 1} status:`, apiResponse.status);

        // --- SUCCESS ---
        if (apiResponse.ok) {
          const result = await apiResponse.json();
          const candidate = result?.candidates?.[0];
          const part = candidate?.content?.parts?.[0];
          
          if (!part?.text) {
            console.error("SERVER ERROR: Unexpected Gemini response structure.", JSON.stringify(result, null, 2));
            let reason = 'Unexpected or empty response structure from AI.';
            if (candidate?.finishReason === 'SAFETY') reason = 'AI response blocked due to safety settings.';
            if (candidate?.finishReason === 'RECITATION') reason = 'AI response blocked due to potential recitation.';
            throw new Error(reason); // This will be caught by the outer catch
          }

          const jsonText = part.text;
          console.log("SERVER LOG: Received JSON text from Gemini:", jsonText.substring(0, 100) + "...");
          const data = JSON.parse(jsonText);
          console.log("SERVER LOG: Successfully parsed JSON data.");
          
          // --- EXIT on SUCCESS ---
          return res.status(200).json({ success: true, ...data });
        }

        // --- RETRYABLE ERROR (503 Overloaded) ---
        if (apiResponse.status === 503) {
          if (attempt === MAX_RETRIES) {
            throw new Error('The model is overloaded. Please try again later. (Max retries reached)');
          }
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`SERVER LOG: Model overloaded (503). Retrying in ${delay}ms...`);
          await sleep(delay);
          continue; // Go to the next loop iteration
        }

        // --- NON-RETRYABLE ERROR (e.g., 400, 401, 500) ---
        let errorBody = `Gemini API Error: ${apiResponse.status} ${apiResponse.statusText}`;
        try {
          const errorJson = await apiResponse.json();
          console.error("SERVER ERROR: Gemini API returned non-retryable error JSON:", errorJson);
          errorBody = errorJson?.error?.message || errorBody;
        } catch (e) {
          console.error("SERVER ERROR: Gemini API returned non-JSON error response.");
        }
        throw new Error(errorBody); // Break the loop and go to outer catch

      } catch (fetchError) {
        // This catches network errors OR errors we threw from non-retryable/last-attempt
        console.error(`SERVER ERROR (Attempt ${attempt + 1}):`, fetchError.message);
        
        if (attempt === MAX_RETRIES) {
          throw fetchError; // Give up and go to main catch block
        }

        // If it's NOT a 503, but a network error, let's retry
        if (!String(fetchError.message).includes('503') && !String(fetchError.message).includes('overloaded')) {
          const delay = BASE_DELAY * Math.pow(2, attempt);
          console.log(`SERVER LOG: Network error. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
        // If it was a 503, the `continue` was already called.
        // If it was a non-retryable, it's thrown and caught by the main catch block.
      }
    } // End of for loop

  } catch (error) {
    // This is the main catch block
    let errorMessage = 'ERROR: The AI service encountered an issue processing the request.'; // Default
    let serverLogMessage = `Vercel Function Error (Grammar Check): ${error.message}`;

    if (error.name === 'AbortError') { // This may still happen if Vercel's timeout is hit
        serverLogMessage = "Vercel Function Error: Request timed out.";
        errorMessage = 'ERROR: The AI analysis took too long. Please try again.';
    } else if (error.message.includes('overloaded')) {
        errorMessage = 'ERROR: The model is overloaded. Please try again later.';
    } else if (error.message.includes('Gemini API Error:')) {
        errorMessage = `ERROR: ${error.message}`;
    } else if (error instanceof SyntaxError) {
        serverLogMessage = `Vercel Function Error: Failed to parse JSON response from AI. ${error.message}`;
        errorMessage = 'ERROR: Received an invalid response format from the AI.';
    }

    console.error(serverLogMessage); // Log detailed error
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

// Wrap the handler with CORS
export default allowCors(handler);

