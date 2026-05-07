const https = require('https');
exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
   console.log('Request received:', JSON.stringify(event.body).slice(0, 200));
   console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY);
    const data = JSON.parse(event.body);

    const prompt = `You are an ABA therapy assistant helping parents improve their child's therapy outcomes at home.

Child: ${data.child} (age ${data.childAge})
Goal: ${data.goalName}

Here are the recent therapy logs:
${JSON.stringify(data.logs, null, 2)}

Based on these logs, provide:
1. What's working (2-3 key findings)
2. What's not working (1-2 key findings)
3. Specific action card recommendations for next cycle (3-4 concrete steps)
4. What to avoid

Keep it practical and specific. Parents are busy — be concise.

Respond ONLY with a JSON object in this exact format, no other text:
{
  "working": ["finding 1", "finding 2"],
  "not_working": ["finding 1"],
  "next_actions": ["step 1", "step 2", "step 3"],
  "avoid": ["thing 1", "thing 2"]
}`;

    const response = await new Promise((resolve, reject) => {
  const postData = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve({ status: res.statusCode, text: () => Promise.resolve(data) }));
  });
  req.on('error', reject);
  req.write(postData);
  req.end();
});

console.log('Claude response status:', response.status);
const responseText = await response.text();
console.log('Claude response:', responseText.slice(0, 500));
const result = JSON.parse(responseText);   
    const text = result.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', analysis })
    };

  } catch(err) {
  console.log('Error caught:', err.toString());
  console.log('Error stack:', err.stack);
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({ status: 'error', message: err.toString() })
  };
}
