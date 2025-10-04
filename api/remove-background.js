import FormData from 'form-data';

// CORS and Preflight request handler
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// Main API handler
async function handler(req, res) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  try {
    // Since Vercel's default parser is on, the raw image is in req.body
    const imageBuffer = req.body;

    const formData = new FormData();
    formData.append('image_file', imageBuffer, 'image.jpg');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: imageBuffer, // Send the buffer directly
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("remove.bg API error:", errorText);
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const resultBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(Buffer.from(resultBuffer));

  } catch (error) {
    console.error("Handler error:", error.message);
    res.status(500).json({ error: 'Failed to process the image.' });
  }
}

export default allowCors(handler);