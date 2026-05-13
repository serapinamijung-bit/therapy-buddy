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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    console.log('Request received');
    console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY);

    const data = JSON.parse(event.body);
    const lang = data.lang || 'en';
    const isKo = lang === 'ko';

    const prompt = isKo
      ? `당신은 ABA 치료 전문가로, 부모가 집에서 아이의 치료 성과를 높일 수 있도록 돕는 역할을 합니다.

아이: ${data.child} (${data.childAge}세)
목표: ${data.goalName}

최근 치료 기록:
${JSON.stringify(data.logs, null, 2)}

이 기록들을 바탕으로 다음을 제공해주세요:
1. 효과 있는 것 (2-3가지 핵심 발견)
2. 아직 효과 없는 것 (1-2가지)
3. 다음 사이클 실행 단계 추천 (구체적인 3-4가지)
4. 피해야 할 것

실용적이고 구체적으로, 부모가 바로 실행할 수 있게 작성해주세요.

반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트는 포함하지 마세요:
{
  "working": ["발견 1", "발견 2"],
  "not_working": ["발견 1"],
  "next_actions": ["단계 1", "단계 2", "단계 3"],
  "avoid": ["것 1", "것 2"]
}`
      : `You are an ABA therapy assistant helping parents improve their child's therapy outcomes at home.

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

    const postData = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = await new Promise((resolve, reject) => {
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
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('Claude status:', res.statusCode);
          console.log('Claude response:', body.slice(0, 500));
          resolve(body);
        });
      });

      req.on('error', (err) => {
        console.log('Request error:', err.toString());
        reject(err);
      });

      req.write(postData);
      req.end();
    });

    const result = JSON.parse(responseText);
    const text = result.content[0].text;
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    // save recommendation to Google Sheet
    try {
      const recPostData = JSON.stringify({
        type: 'recommendation',
        user_id: data.user_id || '',
        child: data.child || '',
        goalName: data.goalName || '',
        working: JSON.stringify(analysis.working || []),
        not_working: JSON.stringify(analysis.not_working || []),
        next_actions: JSON.stringify(analysis.next_actions || []),
        avoid: JSON.stringify(analysis.avoid || []),
      });

      await new Promise((resolve) => {
        const recOptions = {
          hostname: 'script.google.com',
          path: '/macros/s/AKfycbyvPMitlZGQqbA-4mjj4JDXpBLr1J4gtSC4ag7Ce4vZ6qqfVc6b_ohy1dcIvH2Vymo3/exec',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(recPostData)
          }
        };
        const req = https.request(recOptions, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
        });
        req.on('error', () => resolve());
        req.write(recPostData);
        req.end();
      });
      console.log('Saved to Beta_Recommendations');
    } catch(e) {
      console.log('Rec save failed:', e.toString());
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', analysis })
    };

  } catch(err) {
    console.log('Error:', err.toString());
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.toString() })
    };
  }
};
