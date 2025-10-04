import FormData from 'form-data';

// CORS and Preflight request handler
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// Main API handler for ClipDrop
async function handler(req, res) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    const imageBuffer = req.body;

    const formData = new FormData();
    formData.append('image_file', imageBuffer, 'background.jpg');

    const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ClipDrop API error:", errorText);
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