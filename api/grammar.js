// This new file will live alongside 'api/remove-background.js' in your Vercel project.
// It uses our proven proxy pattern.

// The RapidAPI requires a specific way to make requests, which we handle here.
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-rapidapi-key, x-rapidapi-host');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

async function handler(req, res) {
  // 1. Securely get the API Key and Host from Vercel Environment Variables
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST;

  if (!apiKey || !apiHost) {
    console.error('RapidAPI environment variables not set.');
    return res.status(500).json({ error: 'API is not configured on the server.' });
  }
  
  // 2. Get the text from the user's request
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  // 3. Call the external Grammar API (Ginger)
  const apiUrl = `https://${apiHost}/v1/check`;
  const options = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': apiHost
    },
    body: JSON.stringify({ text: text })
  };

  try {
    const apiResponse = await fetch(apiUrl, options);
    const data = await apiResponse.json();

    if (!apiResponse.ok) {
        throw new Error(data.message || 'An error occurred with the grammar API.');
    }
    
    // 4. Reformat the API response to match what our frontend expects
    const corrections = data.corrections.map(item => ({
        mistake: item.mistake,
        correction: item.correct,
        type: item.type,
    }));

    // 5. Send the formatted corrections back to the user
    res.status(200).json({ corrections });

  } catch (error) {
    console.error('Error in grammar function:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export default allowCors(handler);

