export const config = {
  api: {
    bodyParser: false, // Let the raw request stream through
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        // Forward the Content-Type header from the original request
        'Content-Type': req.headers['content-type'], 
      },
      body: req, // Stream the incoming request body directly
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ClipDrop API error:", errorText);
      return res.status(response.status).json({ error: `API Error: ${errorText}` });
    }

    // Stream the successful response back to the user
    res.setHeader('Content-Type', 'image/png');
    return response.body.pipe(res);

  } catch (error) {
    console.error("Handler error:", error.message);
    res.status(500).json({ error: 'Failed to process the image.' });
  }
}