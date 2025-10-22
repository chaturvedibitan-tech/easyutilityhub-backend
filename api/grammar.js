// Final Robust grammar.js with detailed error logging and timeout

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
    // Generic error to frontend
    return res.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // --- Input Validation ---
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, message: 'ERROR: Input text is required.' });
  }

  // --- Gemini API Configuration ---
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  // --- Prompt ---
  const prompt = `
    Analyze the following text meticulously for spelling, grammar, and style errors. Provide an overall tone (e.g., Formal, Informal, Confident) and a clarity score (0-100).
    Text: "${text}"
    Respond ONLY with a single valid JSON object adhering strictly to the provided schema. Do not include any markdown formatting (like \`\`\`json). The indices 'from' and 'to' must be precise character counts from the start of the original text. If no errors are found, return an empty "corrections" array.
  `;

  // --- Payload with Schema ---
  const payload = { /* ... (Schema remains the same as previous version) ... */
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


  // --- API Call with Timeout and Detailed Error Handling ---
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9500); // 9.5 second timeout

  try {
    console.log("SERVER LOG: Sending request to Gemini API...");
    const apiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId); // Clear timeout on successful fetch start
    console.log("SERVER LOG: Received response from Gemini API. Status:", apiResponse.status);

    // Check for non-OK HTTP status first
    if (!apiResponse.ok) {
        let errorBody = `Gemini API Error: ${apiResponse.status} ${apiResponse.statusText}`;
        try {
            const errorJson = await apiResponse.json();
            console.error("SERVER ERROR: Gemini API returned error JSON:", errorJson);
            errorBody = errorJson?.error?.message || errorBody; // Use specific message if available
        } catch (e) {
             console.error("SERVER ERROR: Gemini API returned non-JSON error response.");
        }
        throw new Error(errorBody); // Throw with specific API error
    }

    const result = await apiResponse.json();

    // Deeper check for valid response structure (as before)
    const candidate = result?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
     if (!part?.text) {
        console.error("SERVER ERROR: Unexpected Gemini response structure. Full response:", JSON.stringify(result, null, 2));
         let reason = 'Unexpected or empty response structure from AI.';
         if (candidate?.finishReason === 'SAFETY') reason = 'AI response blocked due to safety settings.';
         if (candidate?.finishReason === 'RECITATION') reason = 'AI response blocked due to potential recitation.';
        throw new Error(reason);
    }

    const jsonText = part.text;
    console.log("SERVER LOG: Received JSON text from Gemini:", jsonText.substring(0, 100) + "..."); // Log snippet

    // Parse the JSON (should be clean due to schema request)
    const data = JSON.parse(jsonText);
    console.log("SERVER LOG: Successfully parsed JSON data.");

    // Send the successful data back
    return res.status(200).json({ success: true, ...data });

  } catch (error) {
    clearTimeout(timeoutId); // Ensure timeout cleared on any error

    let errorMessage = 'ERROR: The AI service encountered an issue processing the request.'; // Default frontend message
    let serverLogMessage = `Vercel Function Error (Grammar Check): ${error.message}`; // Detailed server log

     if (error.name === 'AbortError') {
        serverLogMessage = "Vercel Function Error: Gemini API request timed out.";
        errorMessage = 'ERROR: The AI analysis took too long. Please try again.'; // Specific timeout message
    } else if (error.message.startsWith('Gemini API Error:')) {
         errorMessage = `ERROR: ${error.message}`; // Forward specific API errors
    } else if (error instanceof SyntaxError) {
         serverLogMessage = `Vercel Function Error: Failed to parse JSON response from AI. ${error.message}`;
         errorMessage = 'ERROR: Received an invalid response format from the AI.';
    }

    console.error(serverLogMessage); // Log detailed error on the server
    // Send a potentially more specific, but still safe, error message to the frontend
    return res.status(500).json({ success: false, message: errorMessage });
  }
}

// Wrap the handler with CORS
export default allowCors(handler)