const https = require('https');

function makeRequest(hostname, path, method, postData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method,
      headers: method === 'POST' ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      } : {}
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        console.log('Redirecting to:', location);
        const redirectUrl = new URL(location);
        // follow redirect with GET (standard browser behavior)
        return makeRequest(redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search, 'GET', '').then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('Response status:', res.statusCode);
        console.log('Response body:', body.slice(0, 200));
        resolve(body);
      });
    });

    req.on('error', reject);
    if (method === 'POST' && postData) req.write(postData);
    req.end();
  });
}

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
    const data = JSON.parse(event.body);
    console.log('Sending report email to:', data.to);

    const postData = JSON.stringify({
      type: 'send_report',
      to: data.to,
      subject: data.subject,
      body: data.body,
      replyTo: data.replyTo || ''
    });

    await makeRequest(
      'script.google.com',
      '/macros/s/AKfycbxC0DvofiHI2IsyPBn4aaoHY-2yK2uo-aBZ4x5BVV9JHEJ5lnqIs7wSquWagNIcWThr/exec',
      'POST',
      postData
    );

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
