import FormData from 'form-data';

// Disable Vercel's default parser to handle the raw image stream
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to buffer the entire request stream into a single object
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// CORS handler for browser security
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// The main function
async function handler(req, res) {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    // 1. Receive the entire raw image file into a buffer
    const imageBuffer = await buffer(req);

    // 2. Create a NEW FormData package on the server
    const formData = new FormData();
    formData.append('image_file', imageBuffer, {
      filename: 'image.jpg', // Provide a filename for the API
      contentType: req.headers['content-type'], // Pass along the original content type
    });

    // 3. Send this new, correctly packaged request to ClipDrop
    const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        // The crucial part: use the headers from the form-data library
        // This adds the correct "Content-Type: multipart/form-data; boundary=..."
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ClipDrop API error:", errorText);
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    // 4. Send the successful result back to the user
    const resultBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(Buffer.from(resultBuffer));

  } catch (error) {
    console.error("Handler error:", error.message);
    res.status(500).json({ error: 'Failed to process the image.' });
  }
}

export default allowCors(handler);