// This is the new messenger for the Riddle/Joke Generator.
export default async function handler(request, response) {
  // --- Security Rules (CORS Headers) ---
  response.setHeader('Access-Control-Allow-Origin', 'https://easyutilityhub.com');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // --- Main Logic ---
  const { type, category } = request.body; // Get type and category from the request
  const apiKey = process.env.GEMINI_API_KEY; // Securely get the Gemini key

  if (!type || !category) {
    return response.status(400).json({ success: false, message: 'ERROR: Type and category are required.' });
  }
  if (!apiKey) {
    return response.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // Use the correct model name that works for your key
  const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // --- THE FIX IS HERE: Add instruction for VARIETY ---
  // Re-create the prompt on the server side, asking for a *unique* result.
  const prompt = `Generate one unique, short, family-friendly ${type} in the '${category}' category. Make sure it's different from common examples.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "question": { "type": "STRING" },
          "answer": { "type": "STRING" }
        },
        required: ["question", "answer"]
      },
       // --- THE FIX IS HERE: Increase 'temperature' for more randomness ---
      temperature: 1.0 // Higher value (0.0-1.0+) encourages creativity
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
    console.error("Vercel Function Error (Riddle/Joke):", error.message);
    return response.status(500).json({ success: false, message: 'ERROR: The AI service returned an error.' });
  }
}

