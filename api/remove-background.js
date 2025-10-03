// api/remove-background.js
import { removeBackground } from "@imgly/background-removal-node";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const imageBuffer = req.body;
    const resultBlob = await removeBackground(imageBuffer);
    const arrayBuffer = await resultBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Background removal error:", error);
    res.status(500).json({ error: 'Failed to process the image.' });
  }
}