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
      const goalsStr = data.goals && data.goals.length
        ? data.goals.map((g, i) => `${i}: ${g}`).join(', ')
        : 'none';

      const prompt = `A parent shared this note about their child:

"${data.diary}"

Child: ${data.child}
Existing goals: ${goalsStr}

Do three things:

1. Write a warm, empathetic response (2-3 sentences) — like a supportive friend. Acknowledge what they went through. Be warm and human, not clinical.

2. Extract structured data:
- before: child's state before (one short phrase, or empty)
- technique: what the parent tried (one short sentence, or empty)
- worked: what worked (one short sentence, or empty)
- didnt_work: what didn't work (one short sentence, or empty)
- outcome: exactly one of: Success / Partial success / No success (or empty)
- next: what to try next time (one short sentence, or empty)

3. Goal matching:
- goalIdxs: array of existing goal indices (0, 1, 2...) this note is related to. Can be multiple if the note covers multiple goals. Return [-1] if none match well.
- suggestedGoal: if goalIdxs is [-1], suggest a new goal based on this note:
  - name: short goal name (e.g. "Sharing toys", "Morning routine")
  - trigger: when this behavior happens (one sentence)
  - actions: array of 2-3 specific action steps

Respond in ${isKo ? 'Korean' : 'English'}. Keep fields SHORT (under 15 words each).

Respond ONLY with this JSON:
{
  "empathy": "...",
  "before": "",
  "technique": "",
  "worked": "",
  "didnt_work": "",
  "outcome": "",
  "next": "",
  "goalIdxs": [0],
  "suggestedGoal": null
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

    // CYCLE ANALYSIS MODE — suggest new action steps based on logs
    if (data.type === 'cycle_analysis') {
      const isKo = data.lang === 'ko';
      const logs = data.logs || [];
      const worked = logs.filter(l=>l.worked).map(l=>l.worked).filter(Boolean);
      const notWorked = logs.filter(l=>l.didnt_work).map(l=>l.didnt_work).filter(Boolean);
      const techniques = logs.filter(l=>l.technique).map(l=>l.technique).filter(Boolean);

      const prompt = `You are an experienced behavior therapist (BCBA) reviewing a parent's home practice logs.

Goal: "${data.goal}"
Trigger: "${data.trigger || 'not specified'}"
Child: ${data.child || 'child'}, Age: ${data.age || 'unknown'}

Current action steps:
${(data.actions||[]).filter(a=>a).map((a,i)=>`${i+1}. ${a}`).join('\n')}

Recent home observations:
- What worked: ${worked.slice(-3).join(' / ') || 'nothing noted yet'}
- What didn\'t work: ${notWorked.slice(-3).join(' / ') || 'nothing noted yet'}
- Techniques tried: ${techniques.slice(-3).join(' / ') || 'nothing noted yet'}

As their therapist, suggest 3-4 NEW or IMPROVED action steps based on the data.
- Build directly on what worked
- Replace what didn\'t work with evidence-based alternatives
- Keep steps concrete, under 2 sentences, doable in under 5 minutes at home
- Sound like a therapist giving specific advice, not generic tips

Respond in ${isKo ? 'Korean' : 'English'}.
Respond ONLY with this JSON:
{
  "next_actions": ["step 1", "step 2", "step 3"]
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
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      const text = result.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { next_actions: [] };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'ok', next_actions: parsed.next_actions || [] })
      };
    }

    // SUGGEST GOALS MODE
    if (data.type === 'suggest_goals') {
      const isKo = data.lang === 'ko';
      const ageNum = parseInt(data.age) || 6;

      const ageGuidance = ageNum <= 3
        ? 'Child is a toddler (age 1-3). Focus on: simple 1-step instructions, visual cues, sensory-based activities, parallel play, short attention spans (1-2 min), caregiver modeling. Avoid: complex language, waiting, abstract concepts.'
        : ageNum <= 5
        ? 'Child is preschool age (age 4-5). Focus on: 2-step instructions, visual schedules, play-based learning, peer interaction, 3-5 min activities, choice-giving, praise and immediate rewards. Avoid: long explanations, delayed rewards.'
        : ageNum <= 8
        ? 'Child is early elementary age (age 6-8). Focus on: structured routines, token systems, social stories, turn-taking games, 5-10 min activities, simple emotion labeling. Avoid: too many rules at once, public correction.'
        : ageNum <= 12
        ? 'Child is older elementary age (age 9-12). Focus on: self-monitoring, peer-based strategies, natural consequences, negotiation, longer activities, perspective-taking. Avoid: baby talk, over-praising, hovering.'
        : 'Child is a teenager (age 13+). Focus on: autonomy, self-advocacy, natural consequences, collaborative problem-solving. Avoid: lecturing, public correction, over-controlling.';

      const prompt = `You are an experienced behavior therapist (BCBA) who specializes in working with children and supporting their families at home. A parent has shared what they're struggling with.

Parent's concern: "${data.concern}"
Child: ${data.child}, Age: ${ageNum}

Age-specific guidance for a ${ageNum}-year-old:
${ageGuidance}

Based on what they shared, suggest 2-4 specific, home-based behavioral goals. For each goal:
- name: short, clear goal name (3-6 words, action-oriented)
- icon: one relevant emoji
- trigger: when this behavior typically occurs (one sentence, specific)
- actions: 3-4 concrete steps a parent can try at home today — evidence-based, developmentally appropriate for age ${ageNum}, practical (not clinical jargon)
- avoid: 1-2 things the parent should avoid doing (common mistakes)

Think like a therapist who has seen this situation many times. Be specific and practical, not generic. Sound warm and supportive, not clinical.

Respond in ${isKo ? 'Korean' : 'English'}.
Respond ONLY with this JSON:
{
  "goals": [
    {
      "name": "...",
      "icon": "🎯",
      "trigger": "...",
      "actions": ["...", "...", "...", "..."],
      "avoid": "..."
    }
  ]
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
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      const text = result.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { goals: [] };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'ok', goals: parsed.goals || [] })
      };
    }
    if (data.type === 'clean_goal') {
      const isKo = data.lang === 'ko';
      const prompt = `Clean up this voice input from a parent into a concise, clear phrase:

"${data.text}"

Rules:
- Remove filler words and fix grammar
- Keep it short (under 10 words)
- Preserve the core meaning
- Respond in ${isKo ? 'Korean' : 'English'}
- Return ONLY the cleaned text, nothing else`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      const cleaned = result.content?.[0]?.text?.trim() || data.text;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'ok', cleaned })
      };
    }
    if (data.type === 'insights_summary') {
      const isKo = data.lang === 'ko';
      const prompt = `You are a warm, supportive companion for a parent working on goals with their child.

Parent: ${data.parent}
Child: ${data.child}
Recent logs summary:
${JSON.stringify(data.summary, null, 2)}

Write two short messages:

1. CHILD_PROGRESS (1-2 sentences): A warm, personalized observation about how things are going with the child. Mention something specific that's working or improving. Never mention numbers or percentages.

2. PARENT_CARE (1-2 sentences): A gentle, heartfelt message FOR THE PARENT — not about the child. Acknowledge how much they're carrying. Validate their effort. Offer a small, concrete self-care suggestion or reframe. Examples: "When things feel stuck, try doing something just for fun together — no goals, no structure.", "You don't have to be perfect at this. Showing up is the work.", "It's okay to have hard days. Rest is part of the process too."

Be warm and human, not clinical. Sound like a caring friend, not a therapist.
Respond in ${isKo ? 'Korean' : 'English'}.

Respond ONLY with this JSON, no other text:
{
  "child_progress": "...",
  "parent_care": "..."
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
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const result = await response.json();
      const text = result.content?.[0]?.text || '';
      let child_progress = '', parent_care = '';
      try {
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
        child_progress = parsed.child_progress || '';
        parent_care = parsed.parent_care || '';
      } catch(e) { child_progress = text; }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'ok', message: child_progress, parent_care })
      };
    }    const prompt = `You are a helpful assistant supporting parents who are working on behavioral or developmental goals with their child at home.

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
