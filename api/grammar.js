// Rewritten grammar.js based on the user's reference code (ascii-decode)

// CORS Helper Function (Standard practice for Vercel)
const allowCors = (fn) => async (req, res) => {
  // Use '*' for broad access during development, or restrict to 'https://easyutilityhub.com' for production
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); 

  if (req.method === 'OPTIONS') {
    res.status(200).end(); // Handle preflight requests
    return;
  }
  return await fn(req, res);
};

// Main Handler Function
async function handler(req, res) {
  // --- Secure API Key Retrieval ---
  const apiKey = process.env.GEMINI_API_KEY; 
  if (!apiKey) {
    console.error('Gemini API key not configured.');
    return res.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // --- Input Validation ---
  const { text } = req.body; 
  if (!text) {
    return res.status(400).json({ success: false, message: 'ERROR: Input text is required.' });
  }

  // --- Gemini API Configuration ---
  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  // --- Carefully Crafted Prompt ---
  // Tells the AI exactly what to do and how to format the response.
  const prompt = `
    Analyze the following text meticulously for spelling, grammar, and style errors. Provide an overall tone (e.g., Formal, Informal, Confident) and a clarity score (0-100).
    Text: "${text}"
    Respond ONLY with a single valid JSON object adhering strictly to the provided schema. Do not include any markdown formatting (like \`\`\`json). The indices 'from' and 'to' must be precise character counts from the start of the original text.
  `;

  // --- Payload with Structured JSON Response Schema ---
  // This tells Gemini exactly how to structure its output.
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "analysis": {
            type: "OBJECT",
            properties: {
              "tone": { type: "STRING" },
              "clarityScore": { type: "NUMBER" }
            },
             required: ["tone", "clarityScore"]
          },
          "corrections": {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "from": { type: "NUMBER" },
                "to": { type: "NUMBER" },
                "mistake": { type: "STRING" },
                "correction": { type: "STRING" },
                "type": { type: "STRING", enum: ["Spelling", "Grammar", "Style"]}
              },
              required: ["from", "to", "mistake", "correction", "type"]
            }
          }
        },
        required: ["analysis", "corrections"]
      }
    }
  };

  // --- API Call and Response Handling ---
  try {
    const apiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await apiResponse.json();

    // Check for errors returned by the Gemini API itself
    if (result.error) {
        console.error("Gemini API Error:", result.error.message);
        throw new Error(`Gemini API Error: ${result.error.message}`);
    }
    
    // Check if the expected candidate structure is present
     if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts || !result.candidates[0].content.parts[0].text) {
        console.error("Unexpected Gemini response structure:", result);
        throw new Error('Unexpected response structure from AI.');
    }

    // Extract the JSON text (which should be clean because we requested JSON output)
    const jsonText = result.candidates[0].content.parts[0].text;

    // Parse the guaranteed JSON response
    const data = JSON.parse(jsonText); 

    // Send the successful, structured data back to your website
    return res.status(200).json({ success: true, ...data }); // Sending the whole parsed object

  } catch (error) {
    console.error("Vercel Function Error (Grammar Check):", error.message);
    // Send a generic error message to the frontend for security
    return res.status(500).json({ success: false, message: 'ERROR: The AI service encountered an issue.' });
  }
}

// Wrap the handler with CORS
export default allowCors(handler);

