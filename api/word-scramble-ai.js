// This is the new messenger for the Word Scramble game's AI word generator.
export default async function handler(request, response) {
  // --- Security Rules (CORS Headers) ---
  response.setHeader('Access-Control-Allow-Origin', 'https://easyutilityhub.com');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // --- Main Logic ---
  const { category } = request.body; // Get category from the request
  const apiKey = process.env.GEMINI_API_KEY; // Securely get the Gemini key

  if (!category) {
    return response.status(400).json({ success: false, message: 'ERROR: Category is required.' });
  }
  if (!apiKey) {
    return response.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // Use the correct model name that works for your key
  const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Re-create the prompt and payload on the server side
  const prompt = `Generate a single, moderately difficult, family-friendly English word related to the category '${category}', between 6 and 10 letters long. Also provide a one-sentence clever hint for that word.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "word": { "type": "STRING", "description": "The word to be guessed." },
          "hint": { "type": "STRING", "description": "A hint for the word." }
        },
        required: ["word", "hint"]
      }
    }
  };

  try {
    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await googleResponse.json();

    if (result.error) {
       throw new Error(result.error.message);
    }

    let jsonText = result.candidates[0].content.parts[0].text;

    // Clean potential markdown formatting
    const markdownMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1];
    }

    const data = JSON.parse(jsonText);

    // Send the successful result back to your website
    return response.status(200).json({ success: true, ...data });

  } catch (error) {
    console.error("Vercel Function Error (Word Scramble):", error.message);
    return response.status(500).json({ success: false, message: 'ERROR: The AI service returned an error.' });
  }
}

