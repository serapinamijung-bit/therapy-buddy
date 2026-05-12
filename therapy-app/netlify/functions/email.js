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
    const data = JSON.parse(event.body);
    console.log('Sending report email to:', data.to);

    const postData = JSON.stringify({
      type: 'send_report',
      to: data.to,
      subject: data.subject,
      body: data.body,
      replyTo: data.replyTo || ''
    });

    const responseText = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'script.google.com',
        path: '/macros/s/AKfycbyvPMitlZGQqbA-4mjj4JDXpBLr1J4gtSC4ag7Ce4vZ6qqfVc6b_ohy1dcIvH2Vymo3/exec',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('Apps Script response:', body.slice(0, 200));
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok' })
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
