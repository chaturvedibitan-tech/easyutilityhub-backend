// This configuration is critical. It tells Vercel to not interfere with the request body,
// allowing us to stream it directly. This is the core fix from your analysis.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 1. Enforce POST method
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // 2. Securely get the API key
  const clipDropApiKey = process.env.CLIPDROP_API_KEY;
  if (!clipDropApiKey) {
    console.error('CLIPDROP_API_KEY environment variable not set.');
    return res.status(500).json({ error: 'API key not configured on the server.' });
  }

  try {
    // 3. Forward the request to the ClipDrop API
    const clipDropApiUrl = 'https://clipdrop-api.co/remove-background/v1';
    const response = await fetch(clipDropApiUrl, {
      method: 'POST',
      headers: {
        // Inject the secret API key for authentication.
        'x-api-key': clipDropApiKey,
        // Pass through the original Content-Type header from the client.
        // As your analysis correctly states, this is ESSENTIAL as it contains the boundary.
        'Content-Type': req.headers['content-type'],
      },
      // Stream the raw incoming request body directly to ClipDrop.
      // `req` itself is a readable stream. This is the "dumb pipe".
      body: req,
      // This duplex option is required by modern fetch implementations for streaming.
      duplex: 'half',
    });

    // 4. Handle the response from ClipDrop
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: `ClipDrop API returned status ${response.status}` }));
      console.error('ClipDrop API error:', errorBody);
      return res.status(response.status).json(errorBody);
    }

    // 5. Stream the successful image response back to the client
    res.setHeader('Content-Type', response.headers.get('content-type'));
    // Pipe the binary image data stream from ClipDrop's response to our response.
    return response.body.pipe(res);

  } catch (error) {
    console.error('Error in proxy function:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
}