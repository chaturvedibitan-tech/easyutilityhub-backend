export default async function handler(request, response) {
  // 1. CORS Headers - Allow any origin (*) to fix the blocking issue
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Handle Preflight Request (OPTIONS)
  // Browsers send this first to check permissions. We must say "OK" immediately.
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    // 3. Validation
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return response.status(500).json({ success: false, message: 'Server Configuration Error: API Key missing.' });

    const { category, duration } = request.body;
    
    // Calculate approximate word count needed (avg 60 wpm * minutes) + buffer
    // Default to 1 minute if duration is missing
    const minutes = duration ? parseInt(duration) / 60 : 1;
    const wordCount = Math.ceil(60 * minutes) + 30; 

    // 4. AI Request
    // Using gemini-1.5-flash as it is stable and fast
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `
      Generate a coherent, interesting paragraph for a typing speed test.
      Topic: ${category || "General Knowledge"}
      Length: Approximately ${wordCount} words.
      
      Rules:
      1. Plain text only. No markdown, no titles, no bullets.
      2. Use standard punctuation.
      3. Do not include newlines (return a single long string).
    `;

    const googleResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await googleResponse.json();
    
    if (result.error) {
        console.error("Gemini API Error:", result.error);
        throw new Error(result.error.message);
    }

    let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Clean up text
    if (text) {
        text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
        throw new Error("AI returned empty response");
    }

    return response.status(200).json({ success: true, text: text });

  } catch (error) {
    console.error("Backend Error:", error);
    // Return 500 but with CORS headers so the frontend can read the error
    return response.status(500).json({ success: false, message: error.message });
  }
}
