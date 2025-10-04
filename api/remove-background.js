import FormData from 'form-data';

// Vercel config to disable the automatic body parser.
// This is the most reliable way to handle raw file streams.
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// Main API handler
async function handler(req, res) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    // Manually buffer the raw image data from the incoming request.
    // This ensures we capture the file correctly.
    const imageBuffer = await buffer(req);

    // Create the form data and append the image buffer.
    // This is the correct way to format the request for ClipDrop.
    const formData = new FormData();
    formData.append('image_file', imageBuffer, 'image.jpg');

    const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
      },
      body: formData, // Pass the entire FormData object as the body.
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