const https = require('https');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { audio, mimeType, lang } = JSON.parse(event.body);

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Build multipart form data
    const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const filename = `audio.${ext}`;

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="model"\r\n\r\n`;
    body += `whisper-1\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="language"\r\n\r\n`;
    body += `${lang === 'ko' ? 'ko' : 'en'}\r\n`;

    const headerPart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footerPart = `\r\n--${boundary}--\r\n`;

    const headerBuf = Buffer.from(body + headerPart, 'utf8');
    const footerBuf = Buffer.from(footerPart, 'utf8');
    const fullBody = Buffer.concat([headerBuf, audioBuffer, footerBuf]);

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('Whisper response:', data.slice(0, 200));
          resolve(JSON.parse(data));
        });
      });

      req.on('error', reject);
      req.write(fullBody);
      req.end();
    });

    if (result.text) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: result.text })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'No transcription', details: result })
    };

  } catch(err) {
    console.log('Transcribe error:', err.toString());
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.toString() })
    };
  }
};
