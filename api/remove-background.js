import FormData from 'form-data';

// This code does not need the CORS helper from before, as Vercel handles it for API routes.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Get the API key securely from Vercel's environment variables
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    const imageBuffer = req.body;

    const formData = new FormData();
    formData.append('image_file', imageBuffer, 'image.jpg'); // The filename doesn't matter
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("remove.bg API error:", errorText);
      throw new Error(`API error: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(Buffer.from(buffer));

  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({ error: 'Failed to process the image.' });
  }
}