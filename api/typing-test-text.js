export default async function handler(request, response) {
  // 1. CORS
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();

  // 2. Validation
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(500).json({ success: false, message: 'API Key missing.' });

  const { category, duration } = request.body;
  
  // Calculate approximate word count needed (avg 60 wpm * minutes) + buffer
  const minutes = parseInt(duration) / 60;
  const wordCount = Math.ceil(60 * minutes) + 30; // Buffer 

  // 3. AI Request
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    Generate a coherent, interesting paragraph for a typing speed test.
    Topic: ${category} (General, Technology, History, or Science).
    Length: Approximately ${wordCount} words.
    
    Rules:
    1. Plain text only. No markdown, no titles, no bullets.
    2. Use standard punctuation.
    3. Do not include newlines (single paragraph).
  `;

  try {
    const googleResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await googleResponse.json();
    if (result.error) throw new Error(result.error.message);

    let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Clean up
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
