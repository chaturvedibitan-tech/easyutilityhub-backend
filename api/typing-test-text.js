export default async function handler(request, response) {
  // 1. CORS
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return response.status(500).json({ success: false, message: 'Server Config Error: API Key missing.' });

    const { category, duration, difficulty } = request.body;

    // Calculate word count target (approx 60 WPM)
    const seconds = duration ? parseInt(duration) : 60;
    const wordCount = Math.ceil((seconds / 60) * 60) + 20; 

    // 2. Define Difficulty Rules
    let stylePrompt = "Standard vocabulary and sentence structure.";
    if (difficulty === 'easy') {
        stylePrompt = "Use very simple, common words (top 500 english words). Short, simple sentences. No complex punctuation.";
    } else if (difficulty === 'hard') {
        stylePrompt = "Use advanced vocabulary, technical terms, and complex sentence structures with varied punctuation (commas, semi-colons).";
    }

    // 3. AI Request
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `
      Generate a coherent paragraph for a typing speed test.
      Topic: ${category || "General Knowledge"}
      Difficulty Level: ${difficulty || "medium"}
      Constraint: ${stylePrompt}
      Length: Approximately ${wordCount} words.
      
      Rules:
      1. Plain text only. No markdown, no titles, no bullets.
      2. Do not include newlines (return a single long string).
    `;

    const googleResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await googleResponse.json();
    
    if (result.error) throw new Error(result.error.message);

    let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Cleanup
    if (text) {
        text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
        throw new Error("AI returned empty response");
    }

    return response.status(200).json({ success: true, text: text });

  } catch (error) {
    console.error("Backend Error:", error);
    return response.status(500).json({ success: false, message: error.message });
  }
}
