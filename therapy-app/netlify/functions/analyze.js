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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);
    console.log('Request type:', data.type);
    console.log('Request data keys:', Object.keys(data));

    // DIARY PARSE MODE
    if (data.type === 'parse_diary') {
      const isKo = data.lang === 'ko';
      const prompt = `A parent is logging their experience with their child's behavioral goal. They wrote this freely:

"${data.diary}"

Child: ${data.child}
Goal they were working on: ${data.goal}

Extract the following from their note. If something isn't mentioned, leave it as an empty string. Respond ONLY with JSON:

{
  "before": "child's state before (e.g. calm, resistant, focused, distracted) — one short phrase",
  "technique": "what the parent tried — one short sentence",
  "worked": "what worked, even a little — one short sentence or empty string",
  "didnt_work": "what didn't work — one short sentence or empty string",
  "outcome": "one of exactly: Success, Partial success, No success",
  "next": "what to try next time — one short sentence or empty string"
}

Respond in ${isKo ? 'Korean' : 'English'}. Keep each field SHORT (under 15 words). Do not add anything outside the JSON.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      console.log('Claude response:', JSON.stringify(result).slice(0, 300));

      if (!result.content || !result.content[0]) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ status: 'error', message: 'No content from Claude: ' + JSON.stringify(result).slice(0, 200) })
        };
      }

      const text = result.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'ok', parsed })
      };
    }

    // CYCLE ANALYSIS MODE
    const prompt = `You are a helpful assistant supporting parents who are working on behavioral or developmental goals with their child at home.

Child: ${data.child} (age ${data.childAge})
Goal: ${data.goalName}

Here are the recent logs:
${JSON.stringify(data.logs, null, 2)}

Based on these logs, provide:
1. What's working (2-3 key findings from the logs)
2. What's not working (1-2 key findings)
3. Specific activity ideas for next cycle (3-4 ideas) — these MUST be tangible and immediately actionable. Include real activity names, games, crafts, or daily routine moments. Tailor to the child's age (${data.childAge}) and the specific goal. Examples: "Play 'Candy Land' and practice waiting for your turn", "Make a sandwich together and have your child ask for each ingredient", "Use a visual feelings chart every morning before school". Do NOT say things like "practice turn-taking" without giving a specific activity.
4. What to avoid

Keep it concise. Parents are busy.

Respond ONLY with a JSON object in this exact format, no other text:
{
  "working": ["finding 1", "finding 2"],
  "not_working": ["finding 1"],
  "next_actions": ["specific activity 1", "specific activity 2", "specific activity 3"],
  "avoid": ["thing 1", "thing 2"]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const result = await response.json();
    const text = result.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', analysis })
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.toString() })
    };
  }
};
