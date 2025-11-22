// This is the new messenger for the Name Combiner's AI suggestions.
export default async function handler(request, response) {
  // --- Security Rules (CORS Headers) ---
  response.setHeader('Access-Control-Allow-Origin', 'https://easyutilityhub.com');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // --- Main Logic ---
  const { name1, name2, context } = request.body; // Get data from the request
  const apiKey = process.env.GEMINI_API_KEY; // Securely get the Gemini key

  if (!name1 || !name2) {
    return response.status(400).json({ success: false, message: 'ERROR: Both names are required.' });
  }
  if (!apiKey) {
    return response.status(500).json({ success: false, message: 'ERROR: API Key is not configured on the server.' });
  }

  // Use the correct model name that works for your key
  const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Re-create the prompt on the server side
  const safeContext = context || 'a new brand name'; // Provide default context if none given
  const prompt = `You are a creative naming expert. Given the words '${name1}' and '${name2}' for the context of '${safeContext}', generate a list of 10 unique and catchy combined names.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      // Increase temperature slightly for more creative suggestions
      temperature: 0.8
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

    // Clean potential markdown formatting (important for array responses)
    const markdownMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1];
    }

    const names = JSON.parse(jsonText); // Should be an array of strings

    // Send the successful result back to your website
    return response.status(200).json({ success: true, names: names });

  } catch (error) {
    console.error("Vercel Function Error (Name Combiner):", error.message);
    return response.status(500).json({ success: false, message: 'ERROR: The AI service returned an error.' });
  }

}
