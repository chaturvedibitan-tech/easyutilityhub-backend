import FormData from 'form-data';

    // This config disables Vercel's default parser, which is correct.
    export const config = {
      api: {
        bodyParser: false,
      },
    };

    // Helper to read the image data from the request.
    async function buffer(readable) {
      const chunks = [];
      for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    }

    // CORS handler remains the same.
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

    // The main function with the critical fix.
    async function handler(req, res) {
      const apiKey = process.env.CLIPDROP_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'API key is not configured.' });
      }

      try {
        const imageBuffer = await buffer(req);
        const formData = new FormData();
        formData.append('image_file', imageBuffer, 'image.jpg');

        const response = await fetch('https://clipdrop-api.co/remove-background/v1', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            // --- THIS IS THE CRITICAL FIX ---
            // This line adds the correct "shipping label" (Content-Type) to the package.
            ...formData.getHeaders(),
            // ---------------------------------
          },
          body: formData,
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