import FormData from 'form-data';

// Helper function to set CORS headers and handle preflight requests
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or specify your domain
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // This is the crucial part that handles the "permission slip" (OPTIONS) request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// Main handler function for the remove.bg API call
async function handler(req, res) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured.' });
  }

  try {
    const imageBuffer = req.body;
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

// Wrap the handler with the CORS middleware
export default allowCors(handler);