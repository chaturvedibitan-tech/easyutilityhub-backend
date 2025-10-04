export const config = {
  api: {
    bodyParser: false,
  },
};

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

async function handler(req, res) {
  const clipDropApiKey = process.env.CLIPDROP_API_KEY;
  if (!clipDropApiKey) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  try {
    const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
      method: 'POST',
      headers: {
        'x-api-key': clipDropApiKey,
        'Content-Type': req.headers['content-type'],
      },
      body: req,
      duplex: 'half',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: `ClipDrop API returned status ${response.status}` }));
      console.error('ClipDrop API error:', errorBody);
      return res.status(response.status).json(errorBody);
    }

    // --- THE FINAL, RELIABLE FIX ---
    // Instead of trying to pipe the stream, we buffer the entire response.
    // This is more robust and avoids the .pipe() error completely.
    const resultBuffer = await response.arrayBuffer();

    // Set the headers and send the complete image buffer back to the user.
    res.setHeader('Content-Type', response.headers.get('content-type'));
    res.status(200).send(Buffer.from(resultBuffer));
    // --- END OF FIX ---

  } catch (error) {
    console.error('Error in proxy function:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export default allowCors(handler);