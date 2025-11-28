export default async function handler(request, response) {
  // 1. CORS: Allow ALL origins (*) to stop the blocking error immediately
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle Preflight Check
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    // 2. Validation
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return response.status(500).json({ success: false, message: 'Server Config Error: API Key missing.' });

    const { category, duration } = request.body;

    // Calculate word count based on duration (aim for 60 WPM + buffer)
    // Default to 1 minute (60s) if not provided
    const seconds = duration ? parseInt(duration) : 60;
    const minutes = seconds / 60;
    const wordCount = Math.ceil(60 * minutes) + 20; 

    // 3. AI Request
    // FIXED: Changed '2.5' to '1.5' (The correct model name)
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
        throw new Error(result.error.message);
    }

    let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Cleanup: Remove newlines to make it a continuous stream for typing
    if (text) {
        text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
        throw new Error("AI returned empty response");
    }

    return response.status(200).json({ success: true, text: text });

  } catch (error) {
    console.error("Backend Error:", error);
    // Return 500 but with CORS headers so the frontend can actually read the error message
    return response.status(500).json({ success: false, message: error.message });
  }
}

