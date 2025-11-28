export default async function handler(request, response) {
  // 1. CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return response.status(500).json({ success: false, message: 'Server Config Error: API Key missing.' });

    const { category, duration } = request.body;

    // Exam Standard: Ensure enough text for high speeds (100 WPM+)
    // 2 minutes * 100 WPM = 200 words. We request 300 to be safe.
    const wordCount = 300; 

    // 3. AI Request
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `
      Generate a professional typing test passage.
      Topic: ${category || "General Knowledge"}
      Length: Approximately ${wordCount} words.
      
      Rules:
      1. Plain text paragraph format. No titles, no markdown, no bullet points.
      2. Use standard English punctuation (commas, periods, capitalization).
      3. Ensure the text flows logically (like an article or essay snippet).
      4. Do not include newlines or line breaks.
    `;

    const googleResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await googleResponse.json();
    
    if (result.error) throw new Error(result.error.message);

    let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Cleanup: Flatten to single line for smooth scrolling
    if (text) {
        text = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
        throw new Error("AI returned empty response");
    }

    return response.status(200).json({ success: true, text: text });

  } catch (error) {
    console.error("Backend Error:", error);
    return response.status(500).json({ success: false, message: error.message });
  }
}
