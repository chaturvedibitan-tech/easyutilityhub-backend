// This is the new messenger for the Typing Speed Test's AI text generator.
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

  // Re-create the prompt on the server side
  const prompt = `Generate one single, family-friendly paragraph of about 40-50 words for a typing speed test, related to the category '${category}'. The text should be interesting, contain a mix of common English words, and use standard punctuation. Only return the generated text, with no extra commentary.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
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

    // Extract the plain text response from the AI
    const generatedText = result.candidates[0].content.parts[0].text;

    // Send the successful result back to your website
    return response.status(200).json({ success: true, text: generatedText });

  } catch (error) {
    console.error("Vercel Function Error (Typing Test):", error.message);
    return response.status(500).json({ success: false, message: 'ERROR: The AI service returned an error.' });
  }

}
