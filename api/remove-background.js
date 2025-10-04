export const config = {
  api: {
    bodyParser: false,
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
        'Content-Type': req.headers['content-type'],
      },
      body: req.body,
      // --- THIS IS THE FINAL, CRITICAL FIX ---
      // This line is required by the server environment to stream the file.
      duplex: 'half',
      // ------------------------------------
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ClipDrop API error:", errorText);
      return res.status(response.status).json({ error: `API Error: ${errorText}` });
    }

    res.setHeader('Content-Type', 'image/png');
    return response.body.pipe(res);

  } catch (error) {
    console.error("Handler error:", error.message);
    res.status(500).json({ error: 'Failed to process the image.' });
  }
}