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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mimeType || 'audio/webm',
                data: audio
              }
            },
            {
              type: 'text',
              text: `Please transcribe this audio recording exactly as spoken. The speaker is using ${lang === 'ko' ? 'Korean' : 'English'}. Return only the transcribed text, nothing else.`
            }
          ]
        }]
      })
    });

    const result = await response.json();
    console.log('Transcribe response:', JSON.stringify(result).slice(0, 200));

    if (result.content && result.content[0]) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: result.content[0].text })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'No transcription returned', details: result })
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
