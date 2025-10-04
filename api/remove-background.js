import FormData from 'form-data';

// Vercel config to disable the automatic body parser.
// This allows us to handle the raw image stream directly for more reliability.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to read a request stream into a single buffer.
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// CORS and Preflight request handler
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
    console.error("API Key not found in environment variables.");
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    // Manually buffer the raw image data from the request stream.
    const imageBuffer = await buffer(req);

    const formData = new FormData();
    formData.append('image_file', imageBuffer, 'image.jpg');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, ...formData.getHeaders() },
      body: formData,
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